import assert from "node:assert/strict";
import test from "node:test";
import {
  attachmentMaxFileSizeBytes,
  buildAttachmentStorageConfig
} from "./attachmentStorageConfig.js";

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SECRET_KEY: "server-only-secret",
    SUPABASE_ATTACHMENT_BUCKET: "dental-attachments-dev",
    ATTACHMENT_STORAGE_REQUEST_TIMEOUT_MS: "9000",
    ATTACHMENT_DOWNLOAD_URL_TTL_SECONDS: "120",
    ...overrides
  };
}

test("attachment storage config validates server-only bucket and bounded download TTL", () => {
  const config = buildAttachmentStorageConfig(env());
  assert.equal(config.bucket, "dental-attachments-dev");
  assert.equal(config.downloadUrlTtlSeconds, 120);
  assert.equal(config.requestTimeoutMs, 9000);
  assert.equal(attachmentMaxFileSizeBytes, 20 * 1024 * 1024);
});

test("attachment storage config rejects unsafe bucket and unbounded TTL", () => {
  assert.throws(() => buildAttachmentStorageConfig(env({ SUPABASE_ATTACHMENT_BUCKET: "Bad Bucket" })));
  assert.throws(() => buildAttachmentStorageConfig(env({ ATTACHMENT_DOWNLOAD_URL_TTL_SECONDS: "3600" })));
  assert.throws(() => buildAttachmentStorageConfig(env({ SUPABASE_SECRET_KEY: "" })));
});
