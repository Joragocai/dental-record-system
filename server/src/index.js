import app from "./app.js";
import runtimeConfig, { logRuntimeConfiguration } from "./config/runtimeConfig.js";
import { initializeDatabase } from "./db/database.js";
import { startAutomaticBackupScheduler } from "./services/backupService.js";

const port = 3002;

initializeDatabase();
logRuntimeConfiguration();

app.listen(port, "127.0.0.1", () => {
  console.log(`Dental server running at http://127.0.0.1:${port}`);
  if (runtimeConfig.autoBackupEnabled) {
    console.log("[backup] Automatic weekly backup due-check is enabled.");
  } else {
    console.log("[backup] Automatic weekly backup due-check is disabled.");
  }
  startAutomaticBackupScheduler();
});
