import app from "./app.js";
import { isHostedEnvironment, validateHostedConfiguration } from "./config/hostedSafety.js";

const staging = isHostedEnvironment();
validateHostedConfiguration();
const port = Number(process.env.PORT || 3002);
const host = process.env.HOST || (staging ? "0.0.0.0" : "127.0.0.1");

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

let startAutomaticBackupScheduler = null;
if (!staging) {
  const [{ default: runtimeConfig, logRuntimeConfiguration }, { initializeDatabase }, backupService] = await Promise.all([
    import("./config/runtimeConfig.js"),
    import("./db/database.js"),
    import("./services/backupService.js")
  ]);
  initializeDatabase();
  logRuntimeConfiguration();
  startAutomaticBackupScheduler = backupService.startAutomaticBackupScheduler;
  console.log(`[backup] Automatic weekly backup due-check is ${runtimeConfig.autoBackupEnabled ? "enabled" : "disabled"}.`);
}

app.listen(port, host, () => {
  console.log(`Dental server listening on ${host}:${port}`);
  startAutomaticBackupScheduler?.();
});
