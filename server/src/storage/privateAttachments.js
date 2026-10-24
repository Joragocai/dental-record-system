import { randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const localPreviewRoot = fileURLToPath(new URL("../../data/postgres-private-files/", import.meta.url));
function pathModuleDir(filepath) { return path.dirname(filepath); }
function localStoragePath(key) { return path.join(localPreviewRoot, ...approvedPath(key).split("/")); }
function localPreviewConfigured(env) {
  if (env.CLOUD_LOCAL_PREVIEW !== "true" || env.NODE_ENV === "production") return false;
  const url = new URL(String(env.DATABASE_URL || ""));
  return ["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/dental_presentation_local";
}

const bucketName = "dental-demo-attachments";
export const privateAttachmentMimeExtensions = new Map([
  ["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"],
  ["application/pdf", "pdf"], ["application/msword", "doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["text/plain", "txt"]
]);
export const privateAttachmentMaxBytes = 20 * 1024 * 1024;
const allowedTypes = new Set(privateAttachmentMimeExtensions.keys());
export function storageConfig(env = process.env) {
  if (localPreviewConfigured(env)) return { localPreview: true, bucket: bucketName };
  const url = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = String(env.SUPABASE_SECRET_KEY || "");
  if (!/^https:\/\/[^/]+\.supabase\.co$/.test(url)) throw new Error("SUPABASE_URL is required.");
  if (!key || key.length < 20) throw new Error("SUPABASE_SECRET_KEY is required on the server only.");
  return { url, key, bucket: bucketName };
}
function approvedPath(path) {
  if (typeof path !== "string" || !/^(patients|treatments)\/[a-zA-Z0-9_-]+\/[a-f0-9-]{36}\.(jpg|jpeg|png|webp|pdf|doc|docx|txt)$/.test(path)) {
    throw new Error("Invalid private Storage object path.");
  }
  return path;
}
function headers(config, extra={}) {
  return { Authorization: "Bearer " + config.key, apikey: config.key, ...extra };
}
async function responseOrThrow(response) {
  if (response.ok) return response;
  // Avoid logging provider error body since it may expose an object path or patient metadata.
  const error = new Error("Private attachment storage request failed.");
  error.status = response.status;
  throw error;
}
export function buildPrivateObjectPath(ownerType, ownerId, mimeType) {
  if (!["patients","treatments"].includes(ownerType) || !/^[A-Z]-[0-9]{4}-[0-9]{4}$/.test(ownerId)) {
    throw new Error("Invalid attachment owner.");
  }
  const extension = privateAttachmentMimeExtensions.get(mimeType);
  if (!extension) throw new Error("Unsupported attachment type.");
  return approvedPath(`${ownerType}/${ownerId}/${randomUUID()}.${extension}`);
}
export async function uploadPrivateAttachment(config, { path, mimeType, contents }, fetchImpl=fetch) {
  approvedPath(path);
  if (!allowedTypes.has(mimeType)) throw new Error("Unsupported attachment type.");
  const buffer = Buffer.from(contents);
  if (!buffer.length || buffer.length > privateAttachmentMaxBytes) throw new Error("Attachment must be between 1 byte and 20 MB.");
  if (config.localPreview) {
    const filepath = localStoragePath(path);
    await mkdir(pathModuleDir(filepath), { recursive: true });
    await writeFile(filepath, buffer, { flag: "wx", mode: 0o600 });
    return { bucket: config.bucket, path };
  }
  const response = await fetchImpl(
    `${config.url}/storage/v1/object/${config.bucket}/${path}`,
    { method:"POST", headers: headers(config,{"Content-Type":mimeType,"x-upsert":"false"}),body:buffer }
  );
  await responseOrThrow(response);
  return { bucket:config.bucket, path };
}
export async function downloadPrivateAttachment(config, path, fetchImpl=fetch, signal=null) {
  approvedPath(path);
  if (config.localPreview) {
    const data = await readFile(localStoragePath(path));
    return { ok: true, arrayBuffer: async () => data };
  }
  const response = await fetchImpl(`${config.url}/storage/v1/object/authenticated/${config.bucket}/${path}`,
    { headers:headers(config), ...(signal ? {signal} : {}) });
  await responseOrThrow(response);
  return response;
}
export async function removePrivateAttachments(config, paths, fetchImpl=fetch) {
  if (!Array.isArray(paths) || paths.length > 100) throw new Error("Invalid attachment delete batch.");
  if (!paths.length) return;
  for (const path of paths) approvedPath(path);
  if (config.localPreview) {
    for (const key of paths) {
      try { await unlink(localStoragePath(key)); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    return;
  }
  const response = await fetchImpl(`${config.url}/storage/v1/object/${config.bucket}`, {
    method:"DELETE",headers:headers(config,{"Content-Type":"application/json"}),
    body:JSON.stringify({prefixes:paths})
  });
  await responseOrThrow(response);
}
