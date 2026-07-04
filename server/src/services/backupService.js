import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dbPath } from "../db/database.js";
import { timestampForFile } from "../utils/dateUtils.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "../../..");
const backupsDir = path.join(rootDir, "backups");
const dataDir = path.join(rootDir, "data");
const uploadsDir = path.join(rootDir, "uploads");
const exportsDir = path.join(rootDir, "exports");

function copyIfPresent(source, destination) {
  if (!fs.existsSync(source)) return false;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  return true;
}

function copyDirectoryIfPresent(source, destination) {
  if (!fs.existsSync(source)) return false;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
  return true;
}

export function createSystemBackup(date = new Date()) {
  fs.mkdirSync(backupsDir, { recursive: true });

  const backupName = `backup_${timestampForFile(date)}`;
  const backupRoot = path.join(backupsDir, backupName);
  const backupDataDir = path.join(backupRoot, "data");
  const backupUploadsDir = path.join(backupRoot, "uploads");
  const backupExportsDir = path.join(backupRoot, "exports");

  if (fs.existsSync(backupRoot)) {
    throw new Error(`Backup folder already exists: backups/${backupName}`);
  }

  fs.mkdirSync(backupRoot, { recursive: true });

  try {
    fs.mkdirSync(backupDataDir, { recursive: true });

    const copiedDatabaseFiles = [];
    if (copyIfPresent(dbPath, path.join(backupDataDir, path.basename(dbPath)))) {
      copiedDatabaseFiles.push(path.basename(dbPath));
    }
    if (copyIfPresent(`${dbPath}-shm`, path.join(backupDataDir, `${path.basename(dbPath)}-shm`))) {
      copiedDatabaseFiles.push(`${path.basename(dbPath)}-shm`);
    }
    if (copyIfPresent(`${dbPath}-wal`, path.join(backupDataDir, `${path.basename(dbPath)}-wal`))) {
      copiedDatabaseFiles.push(`${path.basename(dbPath)}-wal`);
    }

    if (!copiedDatabaseFiles.length) {
      throw new Error("Backup incomplete: database files could not be copied.");
    }

    const copiedUploads = copyDirectoryIfPresent(uploadsDir, backupUploadsDir);
    if (!copiedUploads) {
      throw new Error("Backup incomplete: uploads folder could not be copied.");
    }

    const copiedExports = copyDirectoryIfPresent(exportsDir, backupExportsDir);

    return {
      backup_name: backupName,
      backup_path: path.join("backups", backupName),
      copied_items: {
        database: copiedDatabaseFiles,
        uploads: ["patients", "treatments"],
        exports: copiedExports
      }
    };
  } catch (error) {
    throw new Error(error.message || "Backup incomplete.");
  }
}

export { backupsDir, dataDir, uploadsDir, exportsDir };
