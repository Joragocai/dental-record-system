import assert from "node:assert/strict";
import test from "node:test";
import {
  createAttachmentObjectKey,
  validateAttachmentIntentInput,
  validateAttachmentMetadataUpdateInput,
  validateStoredAttachment
} from "./attachmentValidation.js";
import { AttachmentError } from "../services/attachmentErrors.js";

const patientId = "11111111-1111-4111-8111-111111111111";
const branchId = "22222222-2222-4222-8222-222222222222";
const attachmentId = "33333333-3333-4333-8333-333333333333";
const objectId = "44444444-4444-4444-8444-444444444444";

test("attachment intent accepts UUID context and matching extension/MIME only", () => {
  const parsed = validateAttachmentIntentInput({
    patientId,
    treatmentId: null,
    branchId,
    category: "X-ray",
    originalFilename: "scan.jpeg",
    mimeType: "image/jpeg",
    sizeBytes: 1234,
    description: "Fictional test document"
  });
  assert.equal(parsed.patientId, patientId);
  assert.equal(parsed.mimeType, "image/jpeg");

  assert.throws(
    () => validateAttachmentIntentInput({
      patientId,
      branchId,
      category: "X-ray",
      originalFilename: "scan.exe",
      mimeType: "image/jpeg",
      sizeBytes: 1234
    }),
    AttachmentError
  );
});

test("attachment object keys are random UUID paths and contain no original filename or PHI", () => {
  const key = createAttachmentObjectKey(attachmentId, "jpg", () => objectId);
  assert.equal(key, `attachments/${attachmentId}/${objectId}.jpg`);
  assert.doesNotMatch(key, /patient|scan|example|@/i);
});

test("attachment metadata update rejects immutable or unknown fields", () => {
  assert.deepEqual(validateAttachmentMetadataUpdateInput({ category: "Consent Form", description: null }), {
    category: "Consent Form",
    description: null
  });
  assert.throws(() => validateAttachmentMetadataUpdateInput({ category: "X-ray", objectKey: "bad" }), AttachmentError);
});

function ascii(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function docxLike(): Uint8Array {
  const names = ["[Content_Types].xml", "_rels/.rels", "word/document.xml"];
  const chunks: number[] = [0x50, 0x4b, 0x03, 0x04];
  for (const name of names) {
    const nameBytes = [...new TextEncoder().encode(name)];
    const header = new Uint8Array(46);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(28, nameBytes.length, true);
    chunks.push(...header, ...nameBytes);
  }
  return new Uint8Array(chunks);
}

test("stored attachment validation recognizes approved signatures and computes SHA-256", () => {
  const cases: Array<[string, Uint8Array]> = [
    ["image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0x00])],
    ["image/png", new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00])],
    ["image/webp", ascii("RIFF0000WEBPdata")],
    ["application/pdf", ascii("%PDF-1.7 fictional")],
    ["application/msword", new Uint8Array([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1,0x00])],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", docxLike()],
    ["text/plain", ascii("fictional attachment text\n")]
  ];

  for (const [mime, bytes] of cases) {
    const result = validateStoredAttachment(bytes, mime, bytes.length, mime);
    assert.equal(result.sizeBytes, bytes.length);
    assert.match(result.checksumSha256, /^[0-9a-f]{64}$/);
  }
});

test("stored attachment validation rejects MIME/signature mismatch and unsafe text", () => {
  const bytes = ascii("%PDF-1.7");
  assert.throws(() => validateStoredAttachment(bytes, "image/jpeg", bytes.length, "image/jpeg"), AttachmentError);
  const unsafe = new Uint8Array([0x41, 0x00, 0x42]);
  assert.throws(() => validateStoredAttachment(unsafe, "text/plain", unsafe.length, "text/plain"), AttachmentError);
});
