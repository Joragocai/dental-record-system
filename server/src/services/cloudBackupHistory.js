// Metadata only. Never persist the backup passphrase or encrypted archive.
// Only an authenticated user may read their own export history through Express.
import { backupArchiveLimitBytes } from "./cloudBackupArchive.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const exportFilenamePattern = /^dental-demo-backup-[0-9]{8}-[0-9]{6}\.drb$/;

function assertAuthorizedUserId(userId) {
  if (typeof userId !== "string" || !uuidPattern.test(userId)) {
    throw Object.assign(new Error("Authenticated user is required."), { status: 401 });
  }
  return userId;
}

function toExportInfo(row) {
  if (!row) return null;
  return {
    generatedAt: new Date(row.generated_at).toISOString(),
    filename: row.filename,
    archiveBytes: Number(row.archive_bytes)
  };
}

export async function getLatestCloudBackupExport(pool, userId) {
  const authorizedUserId = assertAuthorizedUserId(userId);
  const result = await pool.query(
    `SELECT generated_at, filename, archive_bytes
       FROM public.cloud_backup_exports
       WHERE generated_by = $1
       ORDER BY generated_at DESC, id DESC
       LIMIT 1`,
    [authorizedUserId]
  );
  return toExportInfo(result.rows[0]);
}

export async function recordCloudBackupExport(pool, { userId, filename, archiveBytes }) {
  const authorizedUserId = assertAuthorizedUserId(userId);
  if (typeof filename !== "string" || !exportFilenamePattern.test(filename)) {
    throw new Error("Invalid encrypted export filename.");
  }
  if (!Number.isSafeInteger(archiveBytes) || archiveBytes < 1 || archiveBytes > backupArchiveLimitBytes) {
    throw new Error("Invalid encrypted export size.");
  }
  const result = await pool.query(
    `INSERT INTO public.cloud_backup_exports (generated_by, filename, archive_bytes)
       VALUES ($1, $2, $3)
       RETURNING generated_at, filename, archive_bytes`,
    [authorizedUserId, filename, archiveBytes]
  );
  return toExportInfo(result.rows[0]);
}
