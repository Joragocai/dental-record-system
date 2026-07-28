import path from "node:path";
import runtimeConfig from "../config/runtimeConfig.js";

export const demoMarkerSchemaVersion = 1;
export const demoSeedVersion = "slice2-demo-v1";
export const manilaTimeZone = "Asia/Manila";

export const expectedCounts = {
  patients: 16,
  treatments: 30,
  appointments: 14,
  attachments: 10
};

export const approvedDemoPaths = {
  databasePath: path.resolve(runtimeConfig.projectRoot, "data", "dental-demo.db"),
  markerPath: path.resolve(runtimeConfig.projectRoot, "data", "dental-demo.marker.json"),
  uploadRoot: path.resolve(runtimeConfig.projectRoot, "demo-uploads"),
  patientUploadDir: path.resolve(runtimeConfig.projectRoot, "demo-uploads", "patients"),
  treatmentUploadDir: path.resolve(runtimeConfig.projectRoot, "demo-uploads", "treatments"),
  exportRoot: path.resolve(runtimeConfig.projectRoot, "demo-exports"),
  backupRoot: path.resolve(runtimeConfig.projectRoot, "demo-backups")
};

export function getComparablePath(targetPath) {
  return path.resolve(targetPath).replace(/[\\/]+/g, path.sep).toLowerCase();
}

function isSamePath(leftPath, rightPath) {
  return getComparablePath(leftPath) === getComparablePath(rightPath);
}

export function getManilaTodayIso(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: manilaTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(now);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function ensureDemoRuntimePaths() {
  if (!runtimeConfig.isDemoMode) {
    throw new Error("Demo commands must run with DENTAL_APP_MODE=demo.");
  }

  if (runtimeConfig.autoBackupEnabled) {
    throw new Error("Automatic backup must be disabled in demo mode.");
  }

  const checks = [
    ["database", runtimeConfig.databasePath, approvedDemoPaths.databasePath],
    ["upload root", runtimeConfig.uploadRoot, approvedDemoPaths.uploadRoot],
    ["patient upload directory", runtimeConfig.patientUploadDir, approvedDemoPaths.patientUploadDir],
    ["treatment upload directory", runtimeConfig.treatmentUploadDir, approvedDemoPaths.treatmentUploadDir],
    ["export root", runtimeConfig.exportRoot, approvedDemoPaths.exportRoot],
    ["backup root", runtimeConfig.backupRoot, approvedDemoPaths.backupRoot]
  ];

  for (const [label, actualPath, expectedPath] of checks) {
    if (!isSamePath(actualPath, expectedPath)) {
      throw new Error(`Unsafe demo ${label} path. Expected ${runtimeConfig.getDisplayPath(expectedPath)}.`);
    }
  }
}
