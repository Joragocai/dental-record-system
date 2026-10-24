import express from "express";
import { getPostgresPool } from "../db/postgres/pool.js";
import { cloudBackupAvailability, createCloudBackupDownload } from "../services/cloudBackupSnapshot.js";

// This is a read-only, encrypted browser download, not a managed Supabase
// backup. It does not touch Demo Fill/Reset or store archives on Render.
export function createCloudBackupRouter(pool = null, env = process.env) {
  const router = express.Router();
  router.get("/backup/status", (_req, res) => res.set("Cache-Control", "no-store").json({
    mode: "cloud",
    managedExternally: false,
    backupDownloadAvailable: cloudBackupAvailability(env),
    backupInProgress: false,
    lastBackupStatus: "not-tracked",
    backupDestination: "Encrypted .drb file downloaded to your device",
    lastAutomaticBackupAt: null,
    lastManualBackupAt: null,
    automaticBackupEnabled: false,
    retainedWeeklyCount: 0,
    retainedMonthlyCount: 0,
    isBackupOverdue: false,
    message: "Only backups saved and verified outside the demo environment survive a reset. The server does not retain download history."
  }));
  router.post("/backup/download", async (req, res, next) => {
    try {
      if (req.is("application/json") !== "application/json") {
        return res.status(415).json({ message: "JSON content type is required." });
      }
      if (!cloudBackupAvailability(env)) {
        return res.status(503).json({ message: "Hosted encrypted backups have not been enabled for this dedicated demo project." });
      }
      const activePool = pool || await getPostgresPool();
      const { data, filename } = await createCloudBackupDownload({
        pool: activePool, passphrase: req.body?.passphrase, env
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
  // Intentionally keep old cloud manual backup endpoint disabled so that
  // a client cannot mistake a server operation for a downloaded archive.
  router.post("/backup", (_req, res) => res.status(501).json({
    message: "Use the encrypted download option in Settings to save a personal backup file."
  }));
  return router;
}
