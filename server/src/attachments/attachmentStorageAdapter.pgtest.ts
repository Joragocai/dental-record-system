import assert from "node:assert/strict";
import test from "node:test";
import { createSupabaseAttachmentStorageAdapter, supabaseSignedUploadTtlSeconds } from "./attachmentStorageAdapter.js";
import type { AttachmentStorageConfig } from "./attachmentStorageConfig.js";
import { attachmentAllowedMimeTypes, attachmentMaxFileSizeBytes } from "./attachmentStorageConfig.js";
import { AttachmentError } from "../services/attachmentErrors.js";

const config: AttachmentStorageConfig = {
  supabaseUrl: "https://example.supabase.co",
  secretKey: "server-only-secret",
  bucket: "dental-attachments-dev",
  requestTimeoutMs: 5000,
  downloadUrlTtlSeconds: 120
};

const attachmentId = "11111111-1111-4111-8111-111111111111";
const objectId = "22222222-2222-4222-8222-222222222222";
const objectKey = `attachments/${attachmentId}/${objectId}.pdf`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("private bucket verification rejects public or broadly configured buckets", async () => {
  const publicAdapter = createSupabaseAttachmentStorageAdapter(config, async () =>
    jsonResponse({
      public: true,
      file_size_limit: attachmentMaxFileSizeBytes,
      allowed_mime_types: [...attachmentAllowedMimeTypes]
    })
  );
  await assert.rejects(publicAdapter.ensurePrivateBucket(), AttachmentError);

  const broadAdapter = createSupabaseAttachmentStorageAdapter(config, async () =>
    jsonResponse({
      public: false,
      file_size_limit: attachmentMaxFileSizeBytes,
      allowed_mime_types: null
    })
  );
  await assert.rejects(broadAdapter.ensurePrivateBucket(), AttachmentError);
});

test("private bucket verification accepts the exact approved policy", async () => {
  const adapter = createSupabaseAttachmentStorageAdapter(config, async (_url, init) => {
    assert.match(String(init?.headers && JSON.stringify(init.headers)), /server-only-secret/);
    return jsonResponse({
      public: false,
      file_size_limit: attachmentMaxFileSizeBytes,
      allowed_mime_types: [...attachmentAllowedMimeTypes]
    });
  });
  await adapter.ensurePrivateBucket();
});

test("signed upload authorization is scoped to one exact random object key", async () => {
  let requestedUrl = "";
  const adapter = createSupabaseAttachmentStorageAdapter(config, async (url) => {
    requestedUrl = String(url);
    return jsonResponse({
      url: `/object/upload/sign/${config.bucket}/${objectKey}?token=one-time-upload-token`
    });
  });

  const signed = await adapter.createSignedUpload(objectKey);
  assert.match(requestedUrl, /\/object\/upload\/sign\/dental-attachments-dev\/attachments\//);
  assert.equal(signed.objectKey, objectKey);
  assert.equal(signed.token, "one-time-upload-token");
  assert.equal(signed.expiresInSeconds, supabaseSignedUploadTtlSeconds);
  assert.doesNotMatch(signed.objectKey, /patient|email|filename/i);
});

test("signed download uses bounded application TTL and download filename only in signed response", async () => {
  let requestBody = "";
  const adapter = createSupabaseAttachmentStorageAdapter(config, async (_url, init) => {
    requestBody = String(init?.body ?? "");
    return jsonResponse({
      signedURL: `/object/sign/${config.bucket}/${objectKey}?token=download-token`
    });
  });

  const signed = await adapter.createSignedDownload(objectKey, "fictional report.pdf");
  assert.equal(JSON.parse(requestBody).expiresIn, 120);
  assert.equal(signed.expiresInSeconds, 120);
  assert.match(signed.signedUrl, /download=fictional(?:\+|%20)report\.pdf/);
  assert.doesNotMatch(signed.signedUrl, /server-only-secret/);
});

test("storage object read enforces size and returns provider content type", async () => {
  const bytes = new TextEncoder().encode("%PDF-1.7 fictional");
  const adapter = createSupabaseAttachmentStorageAdapter(config, async () =>
    new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-length": String(bytes.length)
      }
    })
  );

  const object = await adapter.readObject(objectKey);
  assert.equal(object.contentType, "application/pdf");
  assert.deepEqual([...object.bytes], [...bytes]);
});

test("storage deletion targets only the exact object prefix", async () => {
  let body = "";
  const adapter = createSupabaseAttachmentStorageAdapter(config, async (_url, init) => {
    body = String(init?.body ?? "");
    return jsonResponse([]);
  });
  await adapter.deleteObject(objectKey);
  assert.deepEqual(JSON.parse(body), { prefixes: [objectKey] });
});
