import { clinicalBackupTables, createEncryptedCloudBackup, backupArchiveLimitBytes, assertBackupPassphrase } from "./cloudBackupArchive.js";
import { downloadPrivateAttachment, storageConfig } from "../storage/privateAttachments.js";
import { validateDemoStorageObjectPath } from "../demo/cloudDemoGuard.js";

const unavailable = () => Object.assign(new Error("Hosted backup download is not enabled for the dedicated demo project."), { status: 503 });
const tooLarge = () => Object.assign(new Error("The demo is too large for a browser backup. Use a separate verified PostgreSQL and Storage export."), { status: 413 });

export function getCloudBackupConfiguration(env = process.env) {
  if (env.CLOUD_BACKUP_DOWNLOAD_ENABLED !== "true" || env.CLOUD_BACKUP_ENVIRONMENT !== "dental-presentation-demo") {
    throw unavailable();
  }
  const ref = String(env.CLOUD_BACKUP_PROJECT_REF || "").trim();
  if (!/^[a-z0-9-]{6,40}$/.test(ref)) throw unavailable();
  let database;
  let supabase;
  try {
    database = new URL(String(env.DATABASE_URL || ""));
    supabase = new URL(String(env.SUPABASE_URL || ""));
  } catch {
    throw unavailable();
  }
  if (!["postgres:", "postgresql:"].includes(database.protocol) ||
      supabase.protocol !== "https:" || supabase.hostname !== ref + ".supabase.co" ||
      database.pathname !== "/postgres") throw unavailable();

  const direct = database.hostname === "db." + ref + ".supabase.co" && database.username === "postgres";
  const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(database.hostname) &&
    database.username === "postgres." + ref;
  if (!direct && !pooler) throw unavailable();
  return { ref };
}

export function cloudBackupAvailability(env = process.env) {
  try { return Boolean(getCloudBackupConfiguration(env)); }
  catch { return false; }
}

const orderBy = {
  patients: "id", treatments: "id", appointments: "id",
  treatment_payments: "id", attachments: "id", public_id_counters: "prefix, sequence_year"
};

// Deliberately independent of the destructive demo guard: backups should work
// without enabling Demo Fill or Reset.
export async function createCloudBackupDownload({
  pool, passphrase, env = process.env, adapter = {}, now = () => new Date()
}) {
  const { ref } = getCloudBackupConfiguration(env);
  assertBackupPassphrase(passphrase);
  const storage = adapter.storage || storageConfig(env);
  const download = adapter.download || downloadPrivateAttachment;
  const client = await pool.connect();
  const records = {};
  let migrations;
  let objects;
  const files = [];
  let sourceBytes = 0;
  let inTransaction = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    inTransaction = true;
    await client.query("SET LOCAL lock_timeout = '4000ms'");
    await client.query("SET LOCAL statement_timeout = '12000ms'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '80000ms'");
    // SHARE prevents application writes while building a coherent snapshot.
    // This service executes no database mutations and always ROLLBACKs.
    await client.query("LOCK TABLE " +
      clinicalBackupTables.map(table => "public." + table).join(", ") + " IN SHARE MODE");
    for (const table of clinicalBackupTables) {
      const { rows } = await client.query("SELECT * FROM public." + table + " ORDER BY " + orderBy[table]);
      records[table] = rows;
    }
    migrations = (await client.query("SELECT filename, checksum FROM public.schema_migrations ORDER BY filename")).rows;
    objects = (await client.query(
      "SELECT name FROM storage.objects WHERE bucket_id = $1 ORDER BY name",
      ["dental-demo-attachments"]
    )).rows.map(row => row.name);

    const attachmentPaths = records.attachments.map(record => validateDemoStorageObjectPath(record.file_path));
    const sortedPaths = [...attachmentPaths].sort();
    if (new Set(attachmentPaths).size !== attachmentPaths.length ||
        objects.length !== attachmentPaths.length ||
        objects.some((path, index) => path !== sortedPaths[index])) {
      throw Object.assign(new Error("Private Storage inventory does not match attachment records. Resolve orphan or missing files before backing up."), { status: 409 });
    }
    sourceBytes = Buffer.byteLength(JSON.stringify({ tables: records, migrations }), "utf8");
    for (const record of records.attachments) {
      const path = validateDemoStorageObjectPath(record.file_path);
      if (sourceBytes > backupArchiveLimitBytes - 512 * 1024) throw tooLarge();
      // A failed or incomplete Storage download aborts the whole backup.
      const response = await download(storage, path, adapter.fetch || fetch, AbortSignal.timeout(25000));
      const byteLength = Number(response.headers?.get?.("content-length") || 0);
      if (byteLength > backupArchiveLimitBytes - sourceBytes) throw tooLarge();
      const contents = Buffer.from(await response.arrayBuffer());
      if (!contents.length || contents.length > 20 * 1024 * 1024) throw tooLarge();
      if (record.file_size != null && Number(record.file_size) !== contents.length) {
        throw Object.assign(new Error("Private attachment content does not match its saved size. Backup cancelled."), { status: 409 });
      }
      sourceBytes += contents.length;
      if (sourceBytes > backupArchiveLimitBytes - 512 * 1024) throw tooLarge();
      files.push({ path, contents });
    }
  } finally {
    if (inTransaction) {
      try { await client.query("ROLLBACK"); }
      finally { client.release(); }
    } else {
      client.release();
    }
  }
  const createdAt = now().toISOString();
  const archive = await createEncryptedCloudBackup({
    projectRef: ref, records, migrations, files, createdAt
  }, passphrase);
  const stamp = createdAt.replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return { ...archive, filename: "dental-demo-backup-" + stamp + ".drb" };
}
