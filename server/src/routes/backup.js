import fs from "node:fs";
import path from "node:path";
import express from "express";
import { fileURLToPath } from "node:url";
import { dbPath } from "../db/database.js";
import { timestampForFile } from "../utils/dateUtils.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "../../..");
const backupDir = path.join(rootDir, "backups");
fs.mkdirSync(backupDir, { recursive: true });

const router = express.Router();

router.post("/", (_req, res, next) => {
  try {
    const filename = `dental_backup_${timestampForFile()}.db`;
    const destination = path.join(backupDir, filename);
    fs.copyFileSync(dbPath, destination);
    res.status(201).json({ filename, path: destination });
  } catch (error) {
    next(error);
  }
});

export default router;
