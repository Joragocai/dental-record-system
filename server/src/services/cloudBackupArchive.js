import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import JSZip from "jszip";
import { validateDemoStorageObjectPath } from "../demo/cloudDemoGuard.js";

export const clinicalBackupTables = Object.freeze([
  "patients", "treatments", "appointments", "treatment_payments", "attachments", "public_id_counters"
]);
export const backupArchiveLimitBytes = 48 * 1024 * 1024;
const databaseJsonLimitBytes = 10 * 1024 * 1024;
const magic = Buffer.from("DENTBAK1", "ascii");
const saltBytes = 16;
const ivBytes = 12;
const tagBytes = 16;
const prefixBytes = magic.length + saltBytes + ivBytes + tagBytes;
const digest = (contents) => createHash("sha256").update(contents).digest("hex");
const invalidArchive = () => Object.assign(new Error("Backup file is invalid, incompatible, or the passphrase is incorrect."), { status: 400 });

export function assertBackupPassphrase(passphrase) {
  if (typeof passphrase !== "string" || passphrase.length < 14 || passphrase.length > 128) {
    throw Object.assign(new Error("Use a backup passphrase between 14 and 128 characters."), { status: 400 });
  }
  return passphrase;
}

function deriveKey(passphrase, salt) {
  return scryptSync(passphrase, salt, 32, { N: 1 << 14, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

function encryptZip(plaintext, passphrase) {
  const salt = randomBytes(saltBytes);
  const iv = randomBytes(ivBytes);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([magic, salt, iv, cipher.getAuthTag(), body]);
}

function decryptZip(sealed, passphrase) {
  if (!Buffer.isBuffer(sealed) || sealed.length <= prefixBytes ||
      sealed.length > backupArchiveLimitBytes || !sealed.subarray(0, magic.length).equals(magic)) {
    throw invalidArchive();
  }
  const salt = sealed.subarray(magic.length, magic.length + saltBytes);
  const iv = sealed.subarray(magic.length + saltBytes, magic.length + saltBytes + ivBytes);
  const tag = sealed.subarray(magic.length + saltBytes + ivBytes, prefixBytes);
  const body = sealed.subarray(prefixBytes);
  try {
    const cipher = createDecipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
    cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(body), cipher.final()]);
  } catch {
    throw invalidArchive();
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function projectIsValid(value) {
  return typeof value === "string" && /^[a-z0-9-]{6,40}$/.test(value);
}
function validateSnapshotShape(snapshot) {
  if (!isObject(snapshot) || !isObject(snapshot.tables) || !Array.isArray(snapshot.migrations)) {
    throw invalidArchive();
  }
  if (Object.keys(snapshot.tables).sort().join("|") !== [...clinicalBackupTables].sort().join("|") ||
      clinicalBackupTables.some(table => !Array.isArray(snapshot.tables[table]))) {
    throw invalidArchive();
  }
  if (snapshot.migrations.some(migration => !isObject(migration) || typeof migration.filename !== "string" ||
      typeof migration.checksum !== "string")) {
    throw invalidArchive();
  }
}

export async function createEncryptedCloudBackup({ projectRef, records, migrations, files, createdAt = new Date().toISOString() }, passphrase) {
  assertBackupPassphrase(passphrase);
  if (!projectIsValid(projectRef) || !Array.isArray(files)) throw invalidArchive();
  const snapshot = { tables: records, migrations };
  validateSnapshotShape(snapshot);
  const databaseBytes = Buffer.from(JSON.stringify(snapshot), "utf8");
  if (databaseBytes.length > databaseJsonLimitBytes) {
    throw Object.assign(new Error("Database export exceeds the supported demo-backup size."), { status: 413 });
  }
  const archive = new JSZip();
  archive.file("data.json", databaseBytes);
  const entries = [];
  const seen = new Set();
  let totalBytes = databaseBytes.length;
  for (const file of files) {
    if (!isObject(file) || !Buffer.isBuffer(file.contents)) throw invalidArchive();
    const path = validateDemoStorageObjectPath(file.path);
    if (seen.has(path)) throw invalidArchive();
    seen.add(path);
    totalBytes += file.contents.length;
    if (totalBytes > backupArchiveLimitBytes - 512 * 1024) {
      throw Object.assign(new Error("This demo is too large for browser backup. Use an offsite database and Storage export."), { status: 413 });
    }
    archive.file("objects/" + path, file.contents, { createFolders: false, compression: "DEFLATE" });
    entries.push({ path, size: file.contents.length, sha256: digest(file.contents) });
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  const manifest = {
    format: "dental-presentation-demo-backup",
    version: 1,
    projectRef,
    createdAt,
    encrypted: "AES-256-GCM+scrypt",
    counts: Object.fromEntries(clinicalBackupTables.map(table => [table, records[table].length])),
    migrationCount: migrations.length,
    databaseSha256: digest(databaseBytes),
    files: entries
  };
  archive.file("manifest.json", JSON.stringify(manifest, null, 2));
  const zip = await archive.generateAsync({
    type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 4 },
    streamFiles: true
  });
  if (zip.length + prefixBytes > backupArchiveLimitBytes) {
    throw Object.assign(new Error("Encrypted backup is too large for browser download."), { status: 413 });
  }
  return { data: encryptZip(zip, passphrase), manifest };
}

export async function inspectEncryptedCloudBackup(sealed, passphrase) {
  assertBackupPassphrase(passphrase);
  let archive;
  try {
    archive = await JSZip.loadAsync(decryptZip(sealed, passphrase), {
      checkCRC32: true, createFolders: false
    });
  } catch {
    throw invalidArchive();
  }
  try {
    const keys = Object.keys(archive.files);
    if (!keys.includes("manifest.json") || !keys.includes("data.json") ||
        keys.some(key => archive.files[key].dir || archive.files[key].unsafeOriginalName &&
          archive.files[key].unsafeOriginalName !== key)) throw invalidArchive();
    const manifest = JSON.parse(await archive.file("manifest.json").async("string"));
    const databaseBytes = await archive.file("data.json").async("nodebuffer");
    if (databaseBytes.length > databaseJsonLimitBytes || !isObject(manifest) ||
        manifest.format !== "dental-presentation-demo-backup" || manifest.version !== 1 ||
        !projectIsValid(manifest.projectRef) || !Array.isArray(manifest.files) ||
        manifest.databaseSha256 !== digest(databaseBytes)) throw invalidArchive();
    const snapshot = JSON.parse(databaseBytes.toString("utf8"));
    validateSnapshotShape(snapshot);
    if (manifest.migrationCount !== snapshot.migrations.length ||
        clinicalBackupTables.some(table => manifest.counts?.[table] !== snapshot.tables[table].length)) {
      throw invalidArchive();
    }
    const filePaths = new Set();
    const files = [];
    for (const entry of manifest.files) {
      if (!isObject(entry) || typeof entry.path !== "string") throw invalidArchive();
      validateDemoStorageObjectPath(entry.path);
      if (filePaths.has(entry.path)) throw invalidArchive();
      filePaths.add(entry.path);
      const file = archive.file("objects/" + entry.path);
      if (!file) throw invalidArchive();
      const contents = await file.async("nodebuffer");
      if (entry.size !== contents.length || entry.sha256 !== digest(contents)) throw invalidArchive();
      files.push({ path: entry.path, contents });
    }
    if (keys.length !== files.length + 2 ||
        keys.some(key => !["manifest.json", "data.json"].includes(key) &&
          (!key.startsWith("objects/") || !filePaths.has(key.slice("objects/".length))))) {
      throw invalidArchive();
    }
    const attachmentPaths = snapshot.tables.attachments.map(row => row.file_path);
    if (attachmentPaths.length !== filePaths.size ||
        attachmentPaths.some(path => !filePaths.has(path))) throw invalidArchive();
    return { manifest, snapshot, files };
  } catch {
    throw invalidArchive();
  }
}
