import type { QueryResultRow } from "pg";
import type { PgQueryExecutor } from "../postgres/pool.js";

export type AttachmentStatus = "pending" | "uploaded" | "failed" | "deleting" | "deleted";

export interface AttachmentRecord {
  id: string;
  patientId: string;
  treatmentId: string | null;
  branchId: string;
  category: string;
  originalFilename: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string | null;
  uploadedBy: string;
  createdAt: string;
  uploadedAt: string | null;
  updatedAt: string;
  isPatientVisible: boolean;
  description: string | null;
  status: AttachmentStatus;
  deletedAt: string | null;
  deletedBy: string | null;
}

export interface AttachmentParentContext {
  patientExists: boolean;
  treatment: { patientId: string; branchId: string } | null;
}

export interface AttachmentRepository {
  getParentContext(patientId: string, treatmentId: string | null): Promise<AttachmentParentContext>;
  insertPending(record: AttachmentRecord): Promise<AttachmentRecord>;
  getById(id: string): Promise<AttachmentRecord | null>;
  listByPatient(patientId: string): Promise<AttachmentRecord[]>;
  listByTreatment(treatmentId: string): Promise<AttachmentRecord[]>;
  markUploaded(id: string, checksumSha256: string, uploadedAt: string, updatedAt: string): Promise<AttachmentRecord | null>;
  markFailed(id: string, updatedAt: string): Promise<AttachmentRecord | null>;
  updateMetadata(id: string, category: string, description: string | null, updatedAt: string): Promise<AttachmentRecord | null>;
  markDeleting(id: string, updatedAt: string): Promise<AttachmentRecord | null>;
  markDeleted(id: string, deletedBy: string, deletedAt: string, updatedAt: string): Promise<AttachmentRecord | null>;
}

interface AttachmentRow extends QueryResultRow {
  id: unknown;
  patient_id: unknown;
  treatment_id: unknown;
  branch_id: unknown;
  category: unknown;
  original_filename: unknown;
  object_key: unknown;
  mime_type: unknown;
  size_bytes: unknown;
  checksum_sha256: unknown;
  uploaded_by: unknown;
  created_at: unknown;
  uploaded_at: unknown;
  updated_at: unknown;
  is_patient_visible: unknown;
  description: unknown;
  status: unknown;
  deleted_at: unknown;
  deleted_by: unknown;
}

interface ParentRow extends QueryResultRow {
  patient_exists: unknown;
  treatment_patient_id: unknown;
  treatment_branch_id: unknown;
}

function timestamp(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function nullableTimestamp(value: unknown): string | null {
  return value === null ? null : timestamp(value);
}

function mapAttachmentRow(row: AttachmentRow): AttachmentRecord {
  const status = String(row.status);
  if (!["pending", "uploaded", "failed", "deleting", "deleted"].includes(status)) {
    throw new Error("Invalid attachment status.");
  }
  const sizeBytes = Number(row.size_bytes);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1) throw new Error("Invalid attachment size.");

  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    treatmentId: row.treatment_id === null ? null : String(row.treatment_id),
    branchId: String(row.branch_id),
    category: String(row.category),
    originalFilename: String(row.original_filename),
    objectKey: String(row.object_key),
    mimeType: String(row.mime_type),
    sizeBytes,
    checksumSha256: row.checksum_sha256 === null ? null : String(row.checksum_sha256),
    uploadedBy: String(row.uploaded_by),
    createdAt: timestamp(row.created_at),
    uploadedAt: nullableTimestamp(row.uploaded_at),
    updatedAt: timestamp(row.updated_at),
    isPatientVisible: Boolean(row.is_patient_visible),
    description: row.description === null ? null : String(row.description),
    status: status as AttachmentStatus,
    deletedAt: nullableTimestamp(row.deleted_at),
    deletedBy: row.deleted_by === null ? null : String(row.deleted_by)
  };
}

const columns = `
  id, patient_id, treatment_id, branch_id, category, original_filename,
  object_key, mime_type, size_bytes, checksum_sha256, uploaded_by,
  created_at, uploaded_at, updated_at, is_patient_visible, description,
  status, deleted_at, deleted_by
`;

export function createAttachmentRepository(executor: PgQueryExecutor): AttachmentRepository {
  return {
    async getParentContext(patientId, treatmentId) {
      const result = await executor.query<ParentRow>(
        `SELECT
           EXISTS(SELECT 1 FROM patients p WHERE p.id = $1) AS patient_exists,
           t.patient_id AS treatment_patient_id,
           t.branch_id AS treatment_branch_id
         FROM (SELECT 1) seed
         LEFT JOIN treatments t ON t.id = $2`,
        [patientId, treatmentId]
      );
      const row = result.rows[0];
      return {
        patientExists: row?.patient_exists === true,
        treatment:
          row?.treatment_patient_id && row?.treatment_branch_id
            ? {
                patientId: String(row.treatment_patient_id),
                branchId: String(row.treatment_branch_id)
              }
            : null
      };
    },

    async insertPending(record) {
      const result = await executor.query<AttachmentRow>(
        `INSERT INTO attachments (
           id, patient_id, treatment_id, branch_id, category, original_filename,
           object_key, mime_type, size_bytes, checksum_sha256, uploaded_by,
           created_at, uploaded_at, updated_at, is_patient_visible, description,
           status, deleted_at, deleted_by
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10, $11,
           $12, $13, $14, $15, $16,
           $17, $18, $19
         )
         RETURNING ${columns}`,
        [
          record.id,
          record.patientId,
          record.treatmentId,
          record.branchId,
          record.category,
          record.originalFilename,
          record.objectKey,
          record.mimeType,
          record.sizeBytes,
          record.checksumSha256,
          record.uploadedBy,
          record.createdAt,
          record.uploadedAt,
          record.updatedAt,
          record.isPatientVisible,
          record.description,
          record.status,
          record.deletedAt,
          record.deletedBy
        ]
      );
      if (!result.rows[0]) throw new Error("Attachment insert did not return a row.");
      return mapAttachmentRow(result.rows[0]);
    },

    async getById(id) {
      const result = await executor.query<AttachmentRow>(
        `SELECT ${columns} FROM attachments WHERE id = $1`,
        [id]
      );
      return result.rows[0] ? mapAttachmentRow(result.rows[0]) : null;
    },

    async listByPatient(patientId) {
      const result = await executor.query<AttachmentRow>(
        `SELECT ${columns}
         FROM attachments
         WHERE patient_id = $1 AND status = 'uploaded'
         ORDER BY uploaded_at DESC, id DESC`,
        [patientId]
      );
      return result.rows.map(mapAttachmentRow);
    },

    async listByTreatment(treatmentId) {
      const result = await executor.query<AttachmentRow>(
        `SELECT ${columns}
         FROM attachments
         WHERE treatment_id = $1 AND status = 'uploaded'
         ORDER BY uploaded_at DESC, id DESC`,
        [treatmentId]
      );
      return result.rows.map(mapAttachmentRow);
    },

    async markUploaded(id, checksumSha256, uploadedAt, updatedAt) {
      const result = await executor.query<AttachmentRow>(
        `UPDATE attachments
         SET status = 'uploaded', checksum_sha256 = $2, uploaded_at = $3, updated_at = $4
         WHERE id = $1 AND status = 'pending'
         RETURNING ${columns}`,
        [id, checksumSha256, uploadedAt, updatedAt]
      );
      return result.rows[0] ? mapAttachmentRow(result.rows[0]) : null;
    },

    async markFailed(id, updatedAt) {
      const result = await executor.query<AttachmentRow>(
        `UPDATE attachments
         SET status = 'failed', updated_at = $2
         WHERE id = $1 AND status = 'pending'
         RETURNING ${columns}`,
        [id, updatedAt]
      );
      return result.rows[0] ? mapAttachmentRow(result.rows[0]) : null;
    },

    async updateMetadata(id, category, description, updatedAt) {
      const result = await executor.query<AttachmentRow>(
        `UPDATE attachments
         SET category = $2, description = $3, updated_at = $4
         WHERE id = $1 AND status = 'uploaded'
         RETURNING ${columns}`,
        [id, category, description, updatedAt]
      );
      return result.rows[0] ? mapAttachmentRow(result.rows[0]) : null;
    },

    async markDeleting(id, updatedAt) {
      const result = await executor.query<AttachmentRow>(
        `UPDATE attachments
         SET status = 'deleting', updated_at = $2
         WHERE id = $1 AND status = 'uploaded'
         RETURNING ${columns}`,
        [id, updatedAt]
      );
      return result.rows[0] ? mapAttachmentRow(result.rows[0]) : null;
    },

    async markDeleted(id, deletedBy, deletedAt, updatedAt) {
      const result = await executor.query<AttachmentRow>(
        `UPDATE attachments
         SET status = 'deleted', deleted_by = $2, deleted_at = $3, updated_at = $4
         WHERE id = $1 AND status = 'deleting'
         RETURNING ${columns}`,
        [id, deletedBy, deletedAt, updatedAt]
      );
      return result.rows[0] ? mapAttachmentRow(result.rows[0]) : null;
    }
  };
}
