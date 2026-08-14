import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAttachmentType,
  formatUploadedAt,
  isAllowedAttachmentFile,
  isAllowedAttachmentFileSize,
  maxAttachmentFileSizeBytes
} from "./attachments.ts";

test("attachment helpers preserve current allowlist behavior, size boundaries, labels, and fallbacks", () => {
  assert.equal(
    isAllowedAttachmentFile({
      name: "xray.jpg",
      type: "image/jpeg"
    }),
    true
  );

  assert.equal(
    isAllowedAttachmentFile({
      name: "consent-form.pdf",
      type: ""
    }),
    true
  );

  assert.equal(
    isAllowedAttachmentFile({
      name: "script.exe",
      type: "application/octet-stream"
    }),
    false
  );

  assert.equal(
    isAllowedAttachmentFileSize({
      size: maxAttachmentFileSizeBytes
    }),
    true
  );

  assert.equal(
    isAllowedAttachmentFileSize({
      size: maxAttachmentFileSizeBytes + 1
    }),
    false
  );

  assert.equal(formatAttachmentType("profile_photo"), "Profile Photo");
  assert.equal(formatAttachmentType("X-ray"), "X-ray");
  assert.equal(formatUploadedAt(""), "-");
  assert.equal(formatUploadedAt("not-a-date"), "not-a-date");
});
