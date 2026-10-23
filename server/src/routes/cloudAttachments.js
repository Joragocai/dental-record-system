import path from "node:path";
import express from "express";
import multer from "multer";
import { getPostgresPool, withPostgresTransaction } from "../db/postgres/pool.js";
import { getPostgresPatient } from "../db/postgres/patients.js";
import { getPostgresTreatment } from "../db/postgres/treatments.js";
import {
  createPostgresAttachment, deletePostgresAttachmentMetadata,
  getPostgresAttachment, listPostgresAttachments
} from "../db/postgres/attachments.js";
import {
  buildPrivateObjectPath, downloadPrivateAttachment, privateAttachmentMaxBytes,
  privateAttachmentMimeExtensions, removePrivateAttachments, storageConfig,
  uploadPrivateAttachment
} from "../storage/privateAttachments.js";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const extensionsFor = (mime) => mime === "image/jpeg" ? [".jpg", ".jpeg"] :
  privateAttachmentMimeExtensions.has(mime) ? ["." + privateAttachmentMimeExtensions.get(mime)] : [];

function validateFile(file) {
  if (!file) throw fail("Select a file to upload.");
  if (!file.buffer?.length || file.size > privateAttachmentMaxBytes) {
    throw fail("Attachment must be between 1 byte and 20 MB.", 400);
  }
  const extension = path.extname(file.originalname || "").toLowerCase();
  if (!extensionsFor(file.mimetype).includes(extension)) {
    throw fail("Unsupported attachment format or mismatched file extension.");
  }
}

function cleanFilename(filename) {
  return String(filename || "attachment")
    .replaceAll("\\", "/").split("/").pop().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255) || "attachment";
}

function requireCategory(body) {
  const value = String(body?.attachment_type || "").trim();
  if (!value || value.length > 100) throw fail("Attachment Category is required (maximum 100 characters).");
  return value;
}

function validAttachmentId(raw) {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw fail("Invalid attachment ID.");
  return value;
}

export function createCloudAttachmentsRouter(pool = null, dependencies = {}) {
  const router = express.Router();
  const db = async () => pool || getPostgresPool();
  const storage = {
    config: dependencies.storageConfig || storageConfig,
    upload: dependencies.upload || uploadPrivateAttachment,
    download: dependencies.download || downloadPrivateAttachment,
    remove: dependencies.remove || removePrivateAttachments
  };
  const uploadForm = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: privateAttachmentMaxBytes, files: 1, fields: 4, fieldSize: 1024 },
    fileFilter(_req, file, callback) {
      const extension = path.extname(file.originalname || "").toLowerCase();
      if (!extensionsFor(file.mimetype).includes(extension)) {
        return callback(fail("Unsupported attachment format or mismatched file extension."));
      }
      callback(null, true);
    }
  }).single("file");

  // All these routes are mounted after the mandatory Supabase bearer-token gate
  // in cloudApp.js. The upload remains in memory; no public /uploads directory.
  const receiveFile = (req, res, next) => uploadForm(req, res, (error) => {
    if (error?.code === "LIMIT_FILE_SIZE") return next(fail("Maximum file size is 20 MB.", 413));
    if (error instanceof multer.MulterError) return next(fail("Invalid attachment upload.", 400));
    next(error);
  });

  async function saveFile(req, res, forcedTreatmentId = null) {
    const client = await db();
    const patientId = String(req.body?.patient_id || "").trim();
    const treatmentId = forcedTreatmentId || String(req.body?.treatment_id || "").trim() || null;
    const patient = await getPostgresPatient(client, patientId);
    if (!patient) throw fail("A valid patient ID is required.");
    if (treatmentId) {
      const treatment = await getPostgresTreatment(client, treatmentId);
      if (!treatment || treatment.patient_id !== patientId) {
        throw fail("The treatment must belong to the selected patient.");
      }
    }
    const category = requireCategory(req.body);
    validateFile(req.file);
    const ownerType = treatmentId ? "treatments" : "patients";
    const ownerId = treatmentId || patientId;
    const objectPath = buildPrivateObjectPath(ownerType, ownerId, req.file.mimetype);
    const config = storage.config();
    await storage.upload(config, { path: objectPath, mimeType: req.file.mimetype, contents: req.file.buffer });
    let attachment;
    try {
      attachment = await createPostgresAttachment(client, {
        patient_id: patientId,
        treatment_id: treatmentId,
        attachment_type: category,
        original_filename: cleanFilename(req.file.originalname),
        stored_filename: objectPath.split("/").at(-1),
        file_path: objectPath,
        mime_type: req.file.mimetype,
        file_size: req.file.size,
        uploaded_at: new Date().toISOString()
      });
    } catch (error) {
      try {
        await storage.remove(config, [objectPath]);
      } catch {
        // A failed compensation needs a private Storage/database reconciliation;
        // do not print attachment paths or patient details to logs.
        console.error("[cloud] Attachment upload compensation failed; review orphan objects.");
      }
      throw error;
    }
    res.status(201).json({ message: "Attachment uploaded.", attachment, file_path: objectPath });
  }

  router.post("/attachments", receiveFile, asyncRoute((req, res) => saveFile(req, res)));
  router.post("/treatments/:treatmentId/attachments", receiveFile, asyncRoute(async (req, res) => {
    if (req.body?.treatment_id && req.body.treatment_id !== req.params.treatmentId) {
      throw fail("Treatment IDs do not match.");
    }
    return saveFile(req, res, req.params.treatmentId);
  }));

  router.get("/patients/:patientId/attachments", asyncRoute(async (req, res) => {
    const client = await db();
    if (!await getPostgresPatient(client, req.params.patientId)) throw fail("Patient not found.", 404);
    res.json(await listPostgresAttachments(client, { patientId: req.params.patientId, onlyPatientFiles: true }));
  }));
  router.get("/treatments/:treatmentId/attachments", asyncRoute(async (req, res) => {
    const client = await db();
    if (!await getPostgresTreatment(client, req.params.treatmentId)) throw fail("Treatment not found.", 404);
    res.json(await listPostgresAttachments(client, { treatmentId: req.params.treatmentId }));
  }));

  async function servePrivateFile(req, res, preview = false) {
    const client = await db();
    const attachment = await getPostgresAttachment(client, validAttachmentId(req.params.attachmentId));
    if (!attachment) throw fail("Attachment not found.", 404);
    if (preview && !["image/jpeg", "image/png", "image/webp"].includes(attachment.mime_type)) {
      throw fail("Image preview is not supported for this file.", 415);
    }
    const response = await storage.download(storage.config(), attachment.file_path);
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > privateAttachmentMaxBytes) throw fail("Attachment exceeds the supported download limit.", 502);
    res.set({
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Type": attachment.mime_type || "application/octet-stream"
    });
    if (preview) {
      res.set("Content-Disposition", "inline");
    } else {
      res.attachment(cleanFilename(attachment.original_filename));
      res.type(attachment.mime_type || "application/octet-stream");
    }
    res.send(data);
  }
  router.get("/attachments/:attachmentId/preview", asyncRoute((req, res) => servePrivateFile(req, res, true)));
  router.get("/attachments/:attachmentId/download", asyncRoute((req, res) => servePrivateFile(req, res, false)));

  router.delete("/attachments/:attachmentId", asyncRoute(async (req, res) => {
    const client = await db();
    const attachmentId = validAttachmentId(req.params.attachmentId);
    await withPostgresTransaction(async (tx) => {
      // Do not remove database metadata if Storage rejects deletion. The row
      // lock also prevents concurrent deletion requests from racing.
      const result = await tx.query("SELECT id, file_path FROM public.attachments WHERE id=$1 FOR UPDATE", [attachmentId]);
      const attachment = result.rows[0];
      if (!attachment) throw fail("Attachment not found.", 404);
      // Keep a restoration copy before performing an irreversible external deletion.
      // Storage and PostgreSQL cannot share an atomic transaction.
      const config = storage.config();
      const stored = await getPostgresAttachment(tx, attachmentId);
      const original = await storage.download(config, attachment.file_path);
      const contents = Buffer.from(await original.arrayBuffer());
      if (!contents.length || contents.length > privateAttachmentMaxBytes) {
        throw fail("Attachment cannot be safely deleted because its backup is unavailable.", 502);
      }
      await storage.remove(config, [attachment.file_path]);
      try {
        await deletePostgresAttachmentMetadata(tx, attachmentId);
      } catch (error) {
        try {
          await storage.upload(config, { path: attachment.file_path, mimeType: stored.mime_type, contents });
        } catch {
          console.error("[cloud] Attachment deletion compensation failed; manual reconciliation required.");
        }
        throw error;
      }
    }, client);
    res.json({ message: "Attachment deleted successfully." });
  }));
  return router;
}
