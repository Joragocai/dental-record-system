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

export const MAX_ATTACHMENT_FILE_SIZE_MB = 10;
export const MAX_ATTACHMENT_FILE_SIZE_BYTES = MAX_ATTACHMENT_FILE_SIZE_MB * 1024 * 1024;
export const ATTACHMENT_UPLOAD_ERROR_MESSAGE = "Unsupported file type. Please upload an image or document file only.";
export const ATTACHMENT_FILE_SIZE_ERROR_MESSAGE = `File is too large. Maximum attachment size is ${MAX_ATTACHMENT_FILE_SIZE_MB} MB.`;
export const allowedAttachmentMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain"
];

const allowedAttachmentExtensionsByMimeType = new Map([
  ["image/jpeg", [".jpg", ".jpeg"]],
  ["image/png", [".png"]],
  ["image/webp", [".webp"]],
  ["application/pdf", [".pdf"]],
  ["application/msword", [".doc"]],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", [".docx"]],
  ["text/plain", [".txt"]]
]);

const allowedAttachmentExtensions = new Set(
  [...allowedAttachmentExtensionsByMimeType.values()].flat()
);

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

export function isAllowedAttachmentFile(file) {
  if (!file?.originalname || !file?.mimetype) {
    return false;
  }

  const extension = path.extname(file.originalname).toLowerCase();
  const allowedExtensionsForMimeType = allowedAttachmentExtensionsByMimeType.get(file.mimetype);

  if (!allowedExtensionsForMimeType) {
    return false;
  }

  return allowedExtensionsForMimeType.includes(extension) && allowedAttachmentExtensions.has(extension);
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
  }),
  fileFilter(_req, file, callback) {
    if (isAllowedAttachmentFile(file)) {
      callback(null, true);
      return;
    }

    const error = new Error(ATTACHMENT_UPLOAD_ERROR_MESSAGE);
    error.status = 400;
    callback(error);
  },
  limits: {
    fileSize: MAX_ATTACHMENT_FILE_SIZE_BYTES
  }
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

export async function deleteUploadedFileByAbsolutePath(filePath) {
  if (!filePath || typeof filePath !== "string" || !fs.existsSync(filePath)) {
    return { deleted: false, missing: true };
  }

  await unlinkAsync(filePath);
  return { deleted: true };
}
