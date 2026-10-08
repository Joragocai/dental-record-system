import { AttachmentError } from "../services/attachmentErrors.js";
import {
  attachmentAllowedMimeTypes,
  attachmentMaxFileSizeBytes,
  type AttachmentStorageConfig
} from "./attachmentStorageConfig.js";

export const supabaseSignedUploadTtlSeconds = 7200;

export interface AttachmentObject {
  bytes: Uint8Array;
  contentType: string | null;
}

export interface SignedUploadAuthorization {
  objectKey: string;
  signedUrl: string;
  token: string;
  expiresInSeconds: number;
}

export interface SignedDownloadAuthorization {
  signedUrl: string;
  expiresInSeconds: number;
}

export interface AttachmentStorageAdapter {
  ensurePrivateBucket(options?: { createIfMissing?: boolean }): Promise<void>;
  createSignedUpload(objectKey: string): Promise<SignedUploadAuthorization>;
  readObject(objectKey: string): Promise<AttachmentObject>;
  createSignedDownload(objectKey: string, originalFilename: string): Promise<SignedDownloadAuthorization>;
  deleteObject(objectKey: string): Promise<void>;
}

interface ProviderErrorPayload {
  message?: unknown;
  error?: unknown;
}

function headers(config: AttachmentStorageConfig): Record<string, string> {
  return {
    apikey: config.secretKey,
    Authorization: `Bearer ${config.secretKey}`,
    Accept: "application/json"
  };
}

function jsonHeaders(config: AttachmentStorageConfig): Record<string, string> {
  return {
    ...headers(config),
    "Content-Type": "application/json"
  };
}

function assertObjectKey(objectKey: string): string {
  const normalized = objectKey.trim();
  if (
    !/^attachments\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i.test(normalized) ||
    normalized.includes("..") ||
    normalized.includes("\\")
  ) {
    throw new AttachmentError("ATTACHMENT_INPUT_INVALID");
  }
  return normalized;
}

function encodedObjectPath(bucket: string, objectKey: string): string {
  return [bucket, ...assertObjectKey(objectKey).split("/")]
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function safeProviderMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json() as ProviderErrorPayload;
    if (typeof payload.message === "string") return payload.message.toLowerCase();
    if (typeof payload.error === "string") return payload.error.toLowerCase();
  } catch {
    // Do not surface provider payloads.
  }
  return "";
}

async function providerFetch(
  config: AttachmentStorageConfig,
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch {
    throw new AttachmentError("ATTACHMENT_STORAGE_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}

export function createSupabaseAttachmentStorageAdapter(
  config: AttachmentStorageConfig,
  fetchImpl: typeof fetch = fetch
): AttachmentStorageAdapter {
  const storageBase = `${config.supabaseUrl}/storage/v1`;

  function resolveStorageRelativeUrl(relative: string): URL {
    if (relative.startsWith("/storage/v1/")) {
      return new URL(relative, config.supabaseUrl);
    }
    if (relative.startsWith("/object/")) {
      return new URL(`${storageBase}${relative}`);
    }
    throw new AttachmentError("ATTACHMENT_STORAGE_UNAVAILABLE");
  }

  return {
    async ensurePrivateBucket(options = {}) {
      const bucketUrl = `${storageBase}/bucket/${encodeURIComponent(config.bucket)}`;
      const current = await providerFetch(config, fetchImpl, bucketUrl, {
        headers: headers(config)
      });

      if (current.ok) {
        let bucket: { public?: unknown; file_size_limit?: unknown; allowed_mime_types?: unknown };
        try {
          bucket = await current.json() as typeof bucket;
        } catch {
          throw new AttachmentError("ATTACHMENT_STORAGE_UNAVAILABLE");
        }
        if (bucket.public !== false) throw new AttachmentError("ATTACHMENT_STORAGE_UNAVAILABLE");
        const providerLimit = Number(bucket.file_size_limit ?? attachmentMaxFileSizeBytes);
        if (Number.isFinite(providerLimit) && providerLimit > attachmentMaxFileSizeBytes) {
          throw new AttachmentError("ATTACHMENT_STORAGE_UNAVAILABLE");
        }
        const providerMimeTypes = Array.isArray(bucket.allowed_mime_types)
          ? bucket.allowed_mime_types.filter((value): value is string => typeof value === "string").sort()
          : [];
        const expectedMimeTypes = [...attachmentAllowedMimeTypes].sort();
        if (
          providerMimeTypes.length !== expectedMimeTypes.length ||
          providerMimeTypes.some((value, index) => value !== expectedMimeTypes[index])
        ) {
          throw new AttachmentError("ATTACHMENT_STORAGE_UNAVAILABLE");
        }
        return;
      }

      const message = await safeProviderMessage(current);
      const missing = current.status === 404 || message.includes("not found");
      if (!missing || !options.createIfMissing) {
        throw new AttachmentError("ATTACHMENT_STORAGE_UNAVAILABLE");
      }

      const created = await providerFetch(config, fetchImpl, `${storageBase}/bucket`, {
        method: "POST",
        headers: jsonHeaders(config),
        body: JSON.stringify({
          id: config.bucket,
          name: config.bucket,
          public: false,
          file_size_limit: attachmentMaxFileSizeBytes,
          allowed_mime_types: [...attachmentAllowedMimeTypes]
        })
      });
      if (!created.ok) throw new AttachmentError("ATTACHMENT_STORAGE_UNAVAILABLE");

      const verified = await providerFetch(config, fetchImpl, bucketUrl, {
        headers: headers(config)
      });
      if (!verified.ok) throw new AttachmentError("ATTACHMENT_STORAGE_UNAVAILABLE");
      const bucket = await verified.json() as { public?: unknown };
      if (bucket.public !== false) throw new AttachmentError("ATTACHMENT_STORAGE_UNAVAILABLE");
    },

    async createSignedUpload(objectKey) {
      const normalized = assertObjectKey(objectKey);
      const response = await providerFetch(
        config,
        fetchImpl,
        `${storageBase}/object/upload/sign/${encodedObjectPath(config.bucket, normalized)}`,
        {
          method: "POST",
          headers: jsonHeaders(config),
          body: "{}"
        }
      );
      if (!response.ok) throw new AttachmentError("ATTACHMENT_STORAGE_UNAVAILABLE");

      let payload: { url?: unknown };
      try {
        payload = await response.json() as typeof payload;
      } catch {
        throw new AttachmentError("ATTACHMENT_STORAGE_UNAVAILABLE");
      }
      if (typeof payload.url !== "string") {
        throw new AttachmentError("ATTACHMENT_STORAGE_UNAVAILABLE");
      }

      const signedUrl = resolveStorageRelativeUrl(payload.url);
      if (!signedUrl.pathname.includes("/object/upload/sign/")) {
        throw new AttachmentError("ATTACHMENT_STORAGE_UNAVAILABLE");
      }
      const token = signedUrl.searchParams.get("token");
      if (!token) throw new AttachmentError("ATTACHMENT_STORAGE_UNAVAILABLE");

      return {
        objectKey: normalized,
        signedUrl: signedUrl.toString(),
        token,
        expiresInSeconds: supabaseSignedUploadTtlSeconds
      };
    },

    async readObject(objectKey) {
      const response = await providerFetch(
        config,
        fetchImpl,
        `${storageBase}/object/authenticated/${encodedObjectPath(config.bucket, objectKey)}`,
        { headers: headers(config) }
      );
      if (!response.ok) {
        if (response.status === 404) throw new AttachmentError("ATTACHMENT_FILE_INVALID");
        throw new AttachmentError("ATTACHMENT_STORAGE_UNAVAILABLE");
      }

      const contentLength = Number(response.headers.get("content-length") ?? "0");
      if (Number.isFinite(contentLength) && contentLength > attachmentMaxFileSizeBytes) {
        throw new AttachmentError("ATTACHMENT_FILE_INVALID");
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength < 1 || buffer.byteLength > attachmentMaxFileSizeBytes) {
        throw new AttachmentError("ATTACHMENT_FILE_INVALID");
      }

      return {
        bytes: new Uint8Array(buffer),
        contentType: response.headers.get("content-type")
      };
    },

    async createSignedDownload(objectKey, originalFilename) {
      const response = await providerFetch(
        config,
        fetchImpl,
        `${storageBase}/object/sign/${encodedObjectPath(config.bucket, objectKey)}`,
        {
          method: "POST",
          headers: jsonHeaders(config),
          body: JSON.stringify({ expiresIn: config.downloadUrlTtlSeconds })
        }
      );
      if (!response.ok) throw new AttachmentError("ATTACHMENT_STORAGE_UNAVAILABLE");

      const payload = await response.json() as { signedURL?: unknown; signedUrl?: unknown };
      const relative =
        typeof payload.signedURL === "string"
          ? payload.signedURL
          : typeof payload.signedUrl === "string"
            ? payload.signedUrl
            : null;
      if (!relative) throw new AttachmentError("ATTACHMENT_STORAGE_UNAVAILABLE");

      const signed = resolveStorageRelativeUrl(relative);
      if (!signed.pathname.includes("/object/sign/")) {
        throw new AttachmentError("ATTACHMENT_STORAGE_UNAVAILABLE");
      }
      signed.searchParams.set("download", originalFilename);
      return { signedUrl: signed.toString(), expiresInSeconds: config.downloadUrlTtlSeconds };
    },

    async deleteObject(objectKey) {
      const response = await providerFetch(
        config,
        fetchImpl,
        `${storageBase}/object/${encodeURIComponent(config.bucket)}`,
        {
          method: "DELETE",
          headers: jsonHeaders(config),
          body: JSON.stringify({ prefixes: [assertObjectKey(objectKey)] })
        }
      );
      if (!response.ok && response.status !== 404) {
        throw new AttachmentError("ATTACHMENT_STORAGE_UNAVAILABLE");
      }
    }
  };
}
