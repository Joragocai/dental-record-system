import crypto from "node:crypto";
import type { PgPoolManager, PgQueryExecutor } from "../postgres/pool.js";
import {
  createAttachmentRepository,
  type AttachmentRecord,
  type AttachmentRepository
} from "../repositories/attachmentRepository.js";
import { createAuditEventRepository } from "../repositories/auditEventRepository.js";
import { createAuditEventService } from "./auditEventService.js";
import { AttachmentError } from "./attachmentErrors.js";
import type { AttachmentStorageAdapter } from "../attachments/attachmentStorageAdapter.js";
import {
  createAttachmentObjectKey,
  extensionForAttachment,
  requireAttachmentUuid,
  validateAttachmentIntentInput,
  validateAttachmentMetadataUpdateInput,
  validateStoredAttachment,
  type AttachmentIntentInput
} from "../attachments/attachmentValidation.js";

export interface AttachmentActor {
  userId: string;
  authUserId: string;
  requestId: string;
}

export interface AttachmentPublicRecord {
  id: string;
  patientId: string;
  treatmentId: string | null;
  branchId: string;
  category: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string | null;
  uploadedAt: string | null;
  isPatientVisible: boolean;
  description: string | null;
  status: AttachmentRecord["status"];
}

export interface AttachmentAccessContext {
  id: string;
  branchId: string;
  status: AttachmentRecord["status"];
}

export interface AttachmentUploadIntentResult {
  attachment: AttachmentPublicRecord;
  upload: {
    signedUrl: string;
    token: string;
    objectKey: string;
    expiresInSeconds: number;
  };
}

export interface AttachmentService {
  createUploadIntent(input: unknown, actor: AttachmentActor): Promise<AttachmentUploadIntentResult>;
  getAccessContext(attachmentId: unknown): Promise<AttachmentAccessContext>;
  complete(attachmentId: unknown, actor: AttachmentActor): Promise<AttachmentPublicRecord>;
  view(attachmentId: unknown, actor: AttachmentActor): Promise<AttachmentPublicRecord>;
  createDownloadUrl(attachmentId: unknown, actor: AttachmentActor): Promise<{ signedUrl: string; expiresInSeconds: number }>;
  updateMetadata(attachmentId: unknown, input: unknown, actor: AttachmentActor): Promise<AttachmentPublicRecord>;
  deleteAttachment(attachmentId: unknown, actor: AttachmentActor): Promise<{ id: string; status: "deleted" }>;
  listByPatient(patientId: unknown): Promise<AttachmentPublicRecord[]>;
  listByTreatment(treatmentId: unknown): Promise<AttachmentPublicRecord[]>;
}

export interface AttachmentServiceOptions {
  createId?: () => string;
  now?: () => Date;
}

function publicRecord(record: AttachmentRecord): AttachmentPublicRecord {
  return {
    id: record.id,
    patientId: record.patientId,
    treatmentId: record.treatmentId,
    branchId: record.branchId,
    category: record.category,
    originalFilename: record.originalFilename,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    checksumSha256: record.checksumSha256,
    uploadedAt: record.uploadedAt,
    isPatientVisible: record.isPatientVisible,
    description: record.description,
    status: record.status
  };
}

function attachmentAuditInput(record: AttachmentRecord, actor: AttachmentActor) {
  return {
    actorUserId: actor.userId,
    actorAuthUserId: actor.authUserId,
    requestId: actor.requestId,
    attachmentId: record.id,
    patientId: record.patientId,
    treatmentId: record.treatmentId,
    branchId: record.branchId
  };
}

function safePersistenceError(error: unknown): AttachmentError {
  return error instanceof AttachmentError ? error : new AttachmentError("ATTACHMENT_PERSISTENCE_ERROR");
}

async function requireRecord(repository: AttachmentRepository, id: string): Promise<AttachmentRecord> {
  const record = await repository.getById(id);
  if (!record) throw new AttachmentError("ATTACHMENT_NOT_FOUND");
  return record;
}

async function markFailedBestEffort(pool: PgPoolManager, id: string, timestamp: string): Promise<void> {
  try {
    await pool.withTransaction(async (executor) => {
      await createAttachmentRepository(executor).markFailed(id, timestamp);
    });
  } catch {
    // The original validation/storage failure remains primary.
  }
}

async function validateParents(repository: AttachmentRepository, input: AttachmentIntentInput): Promise<void> {
  const parents = await repository.getParentContext(input.patientId, input.treatmentId);
  if (!parents.patientExists) throw new AttachmentError("ATTACHMENT_PARENT_NOT_FOUND");

  if (input.treatmentId) {
    if (!parents.treatment) throw new AttachmentError("ATTACHMENT_PARENT_NOT_FOUND");
    if (parents.treatment.patientId !== input.patientId || parents.treatment.branchId !== input.branchId) {
      throw new AttachmentError("ATTACHMENT_PARENT_MISMATCH");
    }
  }
}

export function createAttachmentService(
  pool: PgPoolManager,
  storage: AttachmentStorageAdapter,
  options: AttachmentServiceOptions = {}
): AttachmentService {
  const createId = options.createId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date());

  return {
    async createUploadIntent(rawInput, actor) {
      const input = validateAttachmentIntentInput(rawInput);
      const extension = extensionForAttachment(input.originalFilename, input.mimeType);
      const timestamp = now().toISOString();

      let inserted: AttachmentRecord;
      try {
        inserted = await pool.withTransaction(async (executor) => {
          const repository = createAttachmentRepository(executor);
          await validateParents(repository, input);
          const id = requireAttachmentUuid(createId());
          const objectKey = createAttachmentObjectKey(id, extension, createId);

          const record: AttachmentRecord = {
            id,
            patientId: input.patientId,
            treatmentId: input.treatmentId,
            branchId: input.branchId,
            category: input.category,
            originalFilename: input.originalFilename,
            objectKey,
            mimeType: input.mimeType,
            sizeBytes: input.sizeBytes,
            checksumSha256: null,
            uploadedBy: requireAttachmentUuid(actor.userId),
            createdAt: timestamp,
            uploadedAt: null,
            updatedAt: timestamp,
            isPatientVisible: false,
            description: input.description,
            status: "pending",
            deletedAt: null,
            deletedBy: null
          };
          return repository.insertPending(record);
        });
      } catch (error) {
        throw safePersistenceError(error);
      }

      try {
        const upload = await storage.createSignedUpload(inserted.objectKey);
        return {
          attachment: publicRecord(inserted),
          upload: {
            signedUrl: upload.signedUrl,
            token: upload.token,
            objectKey: upload.objectKey,
            expiresInSeconds: upload.expiresInSeconds
          }
        };
      } catch (error) {
        await markFailedBestEffort(pool, inserted.id, now().toISOString());
        if (error instanceof AttachmentError) throw error;
        throw new AttachmentError("ATTACHMENT_STORAGE_UNAVAILABLE");
      }
    },

    async getAccessContext(attachmentId) {
      const id = requireAttachmentUuid(attachmentId);
      try {
        const record = await requireRecord(createAttachmentRepository(pool), id);
        return { id: record.id, branchId: record.branchId, status: record.status };
      } catch (error) {
        throw safePersistenceError(error);
      }
    },

    async complete(attachmentId, actor) {
      const id = requireAttachmentUuid(attachmentId);
      let record: AttachmentRecord;
      try {
        record = await requireRecord(createAttachmentRepository(pool), id);
      } catch (error) {
        throw safePersistenceError(error);
      }
      if (record.status !== "pending") throw new AttachmentError("ATTACHMENT_STATE_INVALID");

      let stored;
      try {
        stored = await storage.readObject(record.objectKey);
      } catch (error) {
        if (error instanceof AttachmentError) throw error;
        throw new AttachmentError("ATTACHMENT_STORAGE_UNAVAILABLE");
      }

      let validated;
      try {
        validated = validateStoredAttachment(stored.bytes, record.mimeType, record.sizeBytes, stored.contentType);
      } catch (error) {
        let cleanupFailed = false;
        try {
          await storage.deleteObject(record.objectKey);
        } catch {
          cleanupFailed = true;
        }
        await markFailedBestEffort(pool, record.id, now().toISOString());
        if (cleanupFailed) throw new AttachmentError("ATTACHMENT_RECONCILIATION_REQUIRED");
        throw error instanceof AttachmentError ? error : new AttachmentError("ATTACHMENT_FILE_INVALID");
      }

      const timestamp = now().toISOString();
      try {
        return await pool.withTransaction(async (executor) => {
          const repository = createAttachmentRepository(executor);
          const updated = await repository.markUploaded(id, validated.checksumSha256, timestamp, timestamp);
          if (!updated) throw new AttachmentError("ATTACHMENT_STATE_INVALID");
          await createAuditEventService(createAuditEventRepository(executor)).recordAttachmentUploaded(
            attachmentAuditInput(updated, actor)
          );
          return publicRecord(updated);
        });
      } catch (error) {
        throw safePersistenceError(error);
      }
    },

    async view(attachmentId, actor) {
      const id = requireAttachmentUuid(attachmentId);
      try {
        return await pool.withTransaction(async (executor) => {
          const record = await requireRecord(createAttachmentRepository(executor), id);
          if (record.status !== "uploaded") throw new AttachmentError("ATTACHMENT_STATE_INVALID");
          await createAuditEventService(createAuditEventRepository(executor)).recordAttachmentViewed(
            attachmentAuditInput(record, actor)
          );
          return publicRecord(record);
        });
      } catch (error) {
        throw safePersistenceError(error);
      }
    },

    async createDownloadUrl(attachmentId, actor) {
      const id = requireAttachmentUuid(attachmentId);
      let record: AttachmentRecord;
      try {
        record = await requireRecord(createAttachmentRepository(pool), id);
      } catch (error) {
        throw safePersistenceError(error);
      }
      if (record.status !== "uploaded") throw new AttachmentError("ATTACHMENT_STATE_INVALID");

      const signed = await storage.createSignedDownload(record.objectKey, record.originalFilename);
      try {
        await pool.withTransaction(async (executor) => {
          await createAuditEventService(createAuditEventRepository(executor)).recordAttachmentDownloadUrlIssued(
            attachmentAuditInput(record, actor)
          );
        });
      } catch (error) {
        throw safePersistenceError(error);
      }
      return signed;
    },

    async updateMetadata(attachmentId, rawInput, actor) {
      const id = requireAttachmentUuid(attachmentId);
      const input = validateAttachmentMetadataUpdateInput(rawInput);
      const timestamp = now().toISOString();

      try {
        return await pool.withTransaction(async (executor) => {
          const repository = createAttachmentRepository(executor);
          const existing = await requireRecord(repository, id);
          if (existing.status !== "uploaded") throw new AttachmentError("ATTACHMENT_STATE_INVALID");
          const updated = await repository.updateMetadata(id, input.category, input.description, timestamp);
          if (!updated) throw new AttachmentError("ATTACHMENT_STATE_INVALID");
          await createAuditEventService(createAuditEventRepository(executor)).recordAttachmentMetadataUpdated(
            attachmentAuditInput(updated, actor)
          );
          return publicRecord(updated);
        });
      } catch (error) {
        throw safePersistenceError(error);
      }
    },

    async deleteAttachment(attachmentId, actor) {
      const id = requireAttachmentUuid(attachmentId);
      let record: AttachmentRecord;
      try {
        record = await requireRecord(createAttachmentRepository(pool), id);
      } catch (error) {
        throw safePersistenceError(error);
      }
      if (record.status === "deleted") return { id: record.id, status: "deleted" };
      if (record.status !== "uploaded" && record.status !== "deleting") {
        throw new AttachmentError("ATTACHMENT_STATE_INVALID");
      }

      if (record.status === "uploaded") {
        const timestamp = now().toISOString();
        try {
          record = await pool.withTransaction(async (executor) => {
            const updated = await createAttachmentRepository(executor).markDeleting(id, timestamp);
            if (!updated) throw new AttachmentError("ATTACHMENT_STATE_INVALID");
            return updated;
          });
        } catch (error) {
          throw safePersistenceError(error);
        }
      }

      try {
        await storage.deleteObject(record.objectKey);
      } catch {
        throw new AttachmentError("ATTACHMENT_RECONCILIATION_REQUIRED");
      }

      const timestamp = now().toISOString();
      try {
        return await pool.withTransaction(async (executor) => {
          const repository = createAttachmentRepository(executor);
          const deleted = await repository.markDeleted(id, actor.userId, timestamp, timestamp);
          if (!deleted) throw new AttachmentError("ATTACHMENT_RECONCILIATION_REQUIRED");
          await createAuditEventService(createAuditEventRepository(executor)).recordAttachmentDeleted(
            attachmentAuditInput(deleted, actor)
          );
          return { id: deleted.id, status: "deleted" as const };
        });
      } catch (error) {
        throw safePersistenceError(error);
      }
    },

    async listByPatient(patientId) {
      const id = requireAttachmentUuid(patientId);
      try {
        return (await createAttachmentRepository(pool).listByPatient(id)).map(publicRecord);
      } catch (error) {
        throw safePersistenceError(error);
      }
    },

    async listByTreatment(treatmentId) {
      const id = requireAttachmentUuid(treatmentId);
      try {
        return (await createAttachmentRepository(pool).listByTreatment(id)).map(publicRecord);
      } catch (error) {
        throw safePersistenceError(error);
      }
    }
  };
}
