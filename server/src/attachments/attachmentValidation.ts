import crypto from "node:crypto";
import path from "node:path";
import {
  attachmentAllowedMimeTypes,
  attachmentMaxFileSizeBytes
} from "./attachmentStorageConfig.js";
import { AttachmentError } from "../services/attachmentErrors.js";

const extensionByMime = new Map<string, readonly string[]>([
  ["image/jpeg", [".jpg", ".jpeg"]],
  ["image/png", [".png"]],
  ["image/webp", [".webp"]],
  ["application/pdf", [".pdf"]],
  ["application/msword", [".doc"]],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", [".docx"]],
  ["text/plain", [".txt"]]
]);

const allowedMimeSet = new Set<string>(attachmentAllowedMimeTypes);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AttachmentIntentInput {
  patientId: string;
  treatmentId: string | null;
  branchId: string;
  category: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  description: string | null;
}

export function requireAttachmentUuid(value: unknown): string {
  if (typeof value !== "string") throw new AttachmentError("ATTACHMENT_INPUT_INVALID");
  const normalized = value.trim().toLowerCase();
  if (!uuidPattern.test(normalized)) throw new AttachmentError("ATTACHMENT_INPUT_INVALID");
  return normalized;
}

function optionalUuid(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requireAttachmentUuid(value);
}

function requireText(value: unknown, maximum: number): string {
  if (typeof value !== "string") throw new AttachmentError("ATTACHMENT_INPUT_INVALID");
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new AttachmentError("ATTACHMENT_INPUT_INVALID");
  }
  return normalized;
}

function optionalText(value: unknown, maximum: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requireText(value, maximum);
}

function requireSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > attachmentMaxFileSizeBytes) {
    throw new AttachmentError("ATTACHMENT_INPUT_INVALID");
  }
  return value;
}

export function validateAttachmentIntentInput(input: unknown): AttachmentIntentInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AttachmentError("ATTACHMENT_INPUT_INVALID");
  }
  const record = input as Record<string, unknown>;
  const allowedKeys = new Set([
    "patientId",
    "treatmentId",
    "branchId",
    "category",
    "originalFilename",
    "mimeType",
    "sizeBytes",
    "description"
  ]);
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
    throw new AttachmentError("ATTACHMENT_INPUT_INVALID");
  }

  const originalFilename = requireText(record.originalFilename, 255);
  if (originalFilename.includes("/") || originalFilename.includes("\\")) {
    throw new AttachmentError("ATTACHMENT_INPUT_INVALID");
  }
  const mimeType = requireText(record.mimeType, 150).toLowerCase();
  if (!allowedMimeSet.has(mimeType)) throw new AttachmentError("ATTACHMENT_INPUT_INVALID");

  const extension = path.extname(originalFilename).toLowerCase();
  if (!extensionByMime.get(mimeType)?.includes(extension)) {
    throw new AttachmentError("ATTACHMENT_INPUT_INVALID");
  }

  return {
    patientId: requireAttachmentUuid(record.patientId),
    treatmentId: optionalUuid(record.treatmentId),
    branchId: requireAttachmentUuid(record.branchId),
    category: requireText(record.category, 100),
    originalFilename,
    mimeType,
    sizeBytes: requireSize(record.sizeBytes),
    description: optionalText(record.description, 1000)
  };
}

export interface AttachmentMetadataUpdateInput {
  category: string;
  description: string | null;
}

export function validateAttachmentMetadataUpdateInput(input: unknown): AttachmentMetadataUpdateInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AttachmentError("ATTACHMENT_INPUT_INVALID");
  }
  const record = input as Record<string, unknown>;
  const allowedKeys = new Set(["category", "description"]);
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
    throw new AttachmentError("ATTACHMENT_INPUT_INVALID");
  }
  return {
    category: requireText(record.category, 100),
    description: optionalText(record.description, 1000)
  };
}

export function extensionForAttachment(filename: string, mimeType: string): string {
  const extension = path.extname(filename).toLowerCase();
  if (!extensionByMime.get(mimeType)?.includes(extension)) {
    throw new AttachmentError("ATTACHMENT_INPUT_INVALID");
  }
  return extension.slice(1);
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function isWebp(bytes: Uint8Array): boolean {
  return bytes.length >= 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
}

function zipEntryNames(bytes: Uint8Array): Set<string> {
  const names = new Set<string>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset + 46 <= bytes.length; offset += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue;
    const filenameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const end = offset + 46 + filenameLength + extraLength + commentLength;
    if (end > bytes.length) throw new AttachmentError("ATTACHMENT_FILE_INVALID");
    const nameBytes = bytes.slice(offset + 46, offset + 46 + filenameLength);
    let name: string;
    try {
      name = new TextDecoder("utf-8", { fatal: true }).decode(nameBytes);
    } catch {
      throw new AttachmentError("ATTACHMENT_FILE_INVALID");
    }
    names.add(name);
    offset = end - 1;
  }
  return names;
}

function isDocx(bytes: Uint8Array): boolean {
  if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return false;
  const names = zipEntryNames(bytes);
  return names.has("[Content_Types].xml") && names.has("_rels/.rels") && names.has("word/document.xml");
}

function isConservativeText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text);
  } catch {
    return false;
  }
}

export interface ValidatedStoredAttachment {
  sizeBytes: number;
  checksumSha256: string;
}

export function validateStoredAttachment(
  bytes: Uint8Array,
  declaredMimeType: string,
  declaredSizeBytes: number,
  providerContentType: string | null
): ValidatedStoredAttachment {
  if (bytes.length !== declaredSizeBytes || bytes.length < 1 || bytes.length > attachmentMaxFileSizeBytes) {
    throw new AttachmentError("ATTACHMENT_FILE_INVALID");
  }

  const providerMime = providerContentType?.split(";")[0]?.trim().toLowerCase() ?? null;
  if (providerMime && providerMime !== "application/octet-stream" && providerMime !== declaredMimeType) {
    throw new AttachmentError("ATTACHMENT_FILE_INVALID");
  }

  const valid = (() => {
    switch (declaredMimeType) {
      case "image/jpeg":
        return startsWith(bytes, [0xff, 0xd8, 0xff]);
      case "image/png":
        return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      case "image/webp":
        return isWebp(bytes);
      case "application/pdf":
        return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
      case "application/msword":
        return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return isDocx(bytes);
      case "text/plain":
        return isConservativeText(bytes);
      default:
        return false;
    }
  })();

  if (!valid) throw new AttachmentError("ATTACHMENT_FILE_INVALID");

  return {
    sizeBytes: bytes.length,
    checksumSha256: crypto.createHash("sha256").update(bytes).digest("hex")
  };
}

export function createAttachmentObjectKey(
  attachmentId: string,
  extension: string,
  createId: () => string = () => crypto.randomUUID()
): string {
  const safeAttachmentId = requireAttachmentUuid(attachmentId);
  const objectId = requireAttachmentUuid(createId());
  if (!/^[a-z0-9]{2,5}$/.test(extension)) throw new AttachmentError("ATTACHMENT_INPUT_INVALID");
  return `attachments/${safeAttachmentId}/${objectId}.${extension}`;
}
