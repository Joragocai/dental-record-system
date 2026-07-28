import express from "express";
import { createSystemBackup, getBackupStatus } from "../services/backupService.js";

const router = express.Router();

router.get("/status", async (_req, res) => {
  try {
    res.json(await getBackupStatus());
  } catch (error) {
    res.status(500).json({ message: error.message || "Unable to load backup status." });
  }
});

router.post("/", async (_req, res) => {
  try {
    const backup = await createSystemBackup();
    res.status(201).json({
      message: `Backup completed successfully. Database and uploaded files were copied to ${backup.backup_path}.`,
      ...backup
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "Backup incomplete." });
  }
});

export default router;
