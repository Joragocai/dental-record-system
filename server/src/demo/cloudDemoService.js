import { getCloudDemoConfiguration, assertCloudDemoGuard, validateDemoStorageObjectPath } from "./cloudDemoGuard.js";
import { seedFictionalClinicalRows } from "./cloudDemoSeed.js";
import { seedFictionalAttachments } from "./cloudDemoAttachments.js";
import { getManilaTodayIso } from "../utils/dateUtils.js";
import { removePrivateAttachments, storageConfig } from "../storage/privateAttachments.js";

const LOCK = [2026, 1024];
const tables = ["treatment_payments", "attachments", "appointments", "treatments", "patients", "public_id_counters"];
const countQuery = `SELECT
 (SELECT COUNT(*)::integer FROM public.patients) AS patients,
 (SELECT COUNT(*)::integer FROM public.treatments) AS treatments,
 (SELECT COUNT(*)::integer FROM public.appointments) AS appointments,
 (SELECT COUNT(*)::integer FROM public.attachments) AS attachments`;

export async function cloudDemoStatus(pool, env = process.env) {
  try {
    await assertCloudDemoGuard(pool, getCloudDemoConfiguration(env));
    return { mode: "demo", isDemoMode: true, automaticBackupEnabled: false };
  } catch {
    return { mode: "cloud", isDemoMode: false, automaticBackupEnabled: false };
  }
}
export async function cloudDemoDataStatus(pool, env = process.env) {
  await assertCloudDemoGuard(pool, getCloudDemoConfiguration(env));
  const counts = (await pool.query(countQuery)).rows[0];
  const queued = await pool.query("SELECT COUNT(*)::integer AS pending FROM public.demo_storage_cleanup_queue");
  return { counts, isEmpty: Object.values(counts).every(value => Number(value) === 0),
    storageCleanupPending: Number(queued.rows[0].pending) };
}
async function queuePaths(client, paths) {
  paths.forEach(validateDemoStorageObjectPath);
  if (paths.length) await client.query(
    "INSERT INTO public.demo_storage_cleanup_queue(file_path) SELECT UNNEST($1::text[]) ON CONFLICT DO NOTHING",
    [paths]
  );
}
async function clearFictionalDemoRows(client) {
  const rows = (await client.query("SELECT file_path FROM public.attachments")).rows;
  await queuePaths(client, rows.map(row => row.file_path));
  for (const table of tables) await client.query("DELETE FROM public." + table);
}
async function cleanupQueuedFiles(pool, storage, remove) {
  const rows = (await pool.query("SELECT file_path FROM public.demo_storage_cleanup_queue ORDER BY queued_at LIMIT 100")).rows;
  if (!rows.length) return 0;
  const paths = rows.map(row => validateDemoStorageObjectPath(row.file_path));
  await remove(storage, paths);
  await pool.query("DELETE FROM public.demo_storage_cleanup_queue WHERE file_path=ANY($1::text[])", [paths]);
  return paths.length;
}
export async function mutateCloudDemo({pool, operation, env = process.env, adapter = {}, anchorDate = getManilaTodayIso()}) {
  if (!["fill", "clear"].includes(operation)) throw new Error("Invalid demo operation.");
  const config = getCloudDemoConfiguration(env);
  const storage = adapter.config || storageConfig(env);
  const remove = adapter.remove || removePrivateAttachments;
  const client = await pool.connect();
  let transactionStarted = false;
  const uploaded = [];
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query("SELECT pg_advisory_xact_lock($1,$2)", LOCK);
    await assertCloudDemoGuard(client, config, {lock:true});
    if (operation === "clear") {
      // The authorized full demo reset must not race with payment inserts.
      // This lock lasts through COMMIT or ROLLBACK.
      await client.query("LOCK TABLE public.treatment_payments IN ACCESS EXCLUSIVE MODE");
    }
    await clearFictionalDemoRows(client);
    if (operation === "clear") {
      // PostgreSQL DELETE leaves IDENTITY counters untouched. Unlike setval(),
      // ALTER TABLE ... RESTART is transactional, so a failed reset rolls back
      // both the ledger deletion and the counter change together.
      // Never execute this outside the environment + database demo guard above.
      await client.query("ALTER TABLE public.treatment_payments ALTER COLUMN id RESTART WITH 1");
    }
    let prepared = null;
    if (operation === "fill") {
      prepared = await seedFictionalClinicalRows(client, anchorDate);
      await seedFictionalAttachments(client, prepared, uploaded, {config:storage, upload:adapter.upload});
    }
    await client.query("COMMIT");
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    if (uploaded.length) {
      try { await remove(storage, uploaded); }
      catch { console.error("[cloud demo] Failed to compensate fictional Storage uploads; reconcile private objects."); }
    }
    throw error;
  } finally {
    client.release();
  }
  // All paths were queued in the same transaction as the reset; retries are safe.
  try { await cleanupQueuedFiles(pool, storage, remove); }
  catch { console.error("[cloud demo] Deferred private Storage cleanup pending."); }
  const result = await cloudDemoDataStatus(pool, env);
  return { status: operation === "fill" ? "ready" : "empty",
    anchorDate: operation === "fill" ? anchorDate : null, ...result };
}
