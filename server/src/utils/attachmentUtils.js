import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import multer from "multer";
import { fileURLToPath } from "node:url";

const unlinkAsync = promisify(fs.unlink);

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "../../..");
const uploadsRootDir = path.join(rootDir, "uploads");
const patientUploadDir = path.join(rootDir, "uploads", "patients");
const treatmentUploadDir = path.join(rootDir, "uploads", "treatments");

fs.mkdirSync(patientUploadDir, { recursive: true });
fs.mkdirSync(treatmentUploadDir, { recursive: true });

export function normalizeAttachmentType(value) {
  const attachmentType = String(value || "").trim();

  if (!attachmentType) {
    return { error: "Attachment Category is required." };
  }

  if (attachmentType.length > 100) {
    return { error: "Attachment Category must not be longer than 100 characters." };
  }

  return { value: attachmentType };
}

export const attachmentUpload = multer({
  storage: multer.diskStorage({
    destination(req, _file, callback) {
      callback(null, req.params.treatmentId || req.body.treatment_id ? treatmentUploadDir : patientUploadDir);
    },
    filename(_req, file, callback) {
      const extension = path.extname(file.originalname);
      callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
    }
  })
});

export function buildAttachmentPath(storedFilename, treatmentId) {
  return treatmentId ? `/uploads/treatments/${storedFilename}` : `/uploads/patients/${storedFilename}`;
}

export function resolveAttachmentAbsolutePath(filePath) {
  if (!filePath || typeof filePath !== "string") {
    return null;
  }

  const normalizedRelativePath = filePath.replace(/^\/+/, "");
  const absolutePath = path.resolve(rootDir, normalizedRelativePath);

  if (!absolutePath.startsWith(uploadsRootDir + path.sep) && absolutePath !== uploadsRootDir) {
    return null;
  }

  return absolutePath;
}

export async function deleteAttachmentFileIfPresent(filePath) {
  const absolutePath = resolveAttachmentAbsolutePath(filePath);
  if (!absolutePath) {
    return { deleted: false, skipped: true };
  }

  if (!fs.existsSync(absolutePath)) {
    return { deleted: false, missing: true };
  }

  await unlinkAsync(absolutePath);
  return { deleted: true };
}
