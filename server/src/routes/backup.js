import express from "express";
import { createSystemBackup } from "../services/backupService.js";

const router = express.Router();

router.post("/", (_req, res) => {
  try {
    const backup = createSystemBackup();
    res.status(201).json({
      message: `Backup completed successfully. Database and uploaded files were copied to ${backup.backup_path}.`,
      ...backup
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Backup incomplete." });
  }
});

export default router;
