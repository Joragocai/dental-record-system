import db, { initializeDatabase } from "../src/db/database.js";
import { createSystemBackup } from "../src/services/backupService.js";

try {
  initializeDatabase();
  const backup = await createSystemBackup({ backupType: "manual" });
  console.log("Manual backup completed successfully.");
  console.log("Backup path:", backup.backup_path);
  console.log("Verification status:", backup.verification?.details?.quickCheck || "verified");
} catch (error) {
  console.error("Manual backup failed.");
  console.error(error.message || error);
  process.exitCode = 1;
} finally {
  db?.close?.();
}
