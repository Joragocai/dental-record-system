import express from "express";
import { getPostgresPool } from "../db/postgres/pool.js";
import { cloudBackupAvailability, createCloudBackupDownload } from "../services/cloudBackupSnapshot.js";
import { getLatestCloudBackupExport, recordCloudBackupExport } from "../services/cloudBackupHistory.js";

// The encrypted file goes directly to the browser. Supabase stores only
// authenticated export metadata, not file bytes or the user's passphrase.
// The route is mounted AFTER verified Supabase authentication in cloudApp.
export function createCloudBackupRouter(pool = null, env = process.env, { createDownload = createCloudBackupDownload } = {}) {
  const router = express.Router();

  router.get("/backup/status", async (req, res, next) => {
    try {
      const activePool = pool || await getPostgresPool();
      const latestExport = await getLatestCloudBackupExport(activePool, req.clinicAuth?.userId);
      return res.set("Cache-Control", "no-store").json({
        mode: "cloud",
        backupDownloadAvailable: cloudBackupAvailability(env),
        backupInProgress: false,
        latestExport
      });
    } catch (error) { return next(error); }
  });

  router.post("/backup/download", async (req, res, next) => {
    try {
      if (req.is("application/json") !== "application/json") {
        return res.status(415).json({ message: "JSON content type is required." });
      }
      if (!cloudBackupAvailability(env)) {
        return res.status(503).json({ message: "Hosted encrypted backups have not been enabled for this dedicated demo project." });
      }
      const activePool = pool || await getPostgresPool();
      const { data, filename } = await createDownload({
        pool: activePool, passphrase: req.body?.passphrase, env
      });

      // A completed archive-generation event is logged BEFORE initiating the
      // HTTP download. This does NOT guarantee the browser saved the file.
      // If metadata cannot be recorded, fail rather than report untracked success.
      await recordCloudBackupExport(activePool, {
        userId: req.clinicAuth?.userId, filename, archiveBytes: data.length
      });

      res.set({
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="' + filename + '"'
      });
      return res.send(data);
    } catch (error) { return next(error); }
  });

  // Intentionally keep the old cloud manual backup endpoint disabled.
  router.post("/backup", (_req, res) => res.status(501).json({
    message: "Use the encrypted download option in Settings to save a personal backup file."
  }));
  return router;
}
