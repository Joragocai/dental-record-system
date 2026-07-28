import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "../../..");

const supportedModes = new Set(["clean", "demo"]);

function parseBooleanEnv(value, fallback) {
  if (value === undefined) return fallback;

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function resolveFromProject(inputPath, fallbackRelativePath) {
  const candidate = String(inputPath || fallbackRelativePath || "").trim();
  if (!candidate) {
    throw new Error("A runtime path is required.");
  }

  return path.normalize(path.isAbsolute(candidate) ? candidate : path.resolve(projectRoot, candidate));
}

function getComparablePath(targetPath) {
  return path.resolve(targetPath).replace(/[\\/]+/g, path.sep).toLowerCase();
}

function isSamePath(leftPath, rightPath) {
  return getComparablePath(leftPath) === getComparablePath(rightPath);
}

function isSameOrInsidePath(targetPath, parentPath) {
  const normalizedTarget = getComparablePath(targetPath);
  const normalizedParent = getComparablePath(parentPath);

  if (normalizedTarget === normalizedParent) return true;

  const relative = path.relative(normalizedParent, normalizedTarget);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isSameOrContainsPath(containerPath, childPath) {
  return isSameOrInsidePath(childPath, containerPath);
}

function ensureSafeUploadRoot(uploadRoot, backupRoot) {
  const protectedPaths = [
    projectRoot,
    path.join(projectRoot, "server"),
    path.join(projectRoot, "client"),
    path.join(projectRoot, "data"),
    path.join(projectRoot, "backups"),
    path.join(projectRoot, "demo-backups"),
    path.join(projectRoot, "demo-fixtures"),
    path.join(projectRoot, "node_modules")
  ];

  if (protectedPaths.some((protectedPath) => isSamePath(uploadRoot, protectedPath))) {
    throw new Error("Upload root cannot be the project root or another protected application directory.");
  }

  if (isSamePath(uploadRoot, backupRoot)) {
    throw new Error("Upload root cannot be the same as the backup root.");
  }

  if (protectedPaths.some((protectedPath) => isSameOrContainsPath(uploadRoot, protectedPath))) {
    throw new Error("Upload root cannot contain protected application folders.");
  }
}

function ensureSafeBackupRoot(backupRoot, databasePath, uploadRoot) {
  const databaseDir = path.dirname(databasePath);
  const protectedPaths = [
    projectRoot,
    path.join(projectRoot, "server"),
    path.join(projectRoot, "client"),
    path.join(projectRoot, "data"),
    path.join(projectRoot, "uploads"),
    path.join(projectRoot, "demo-uploads"),
    path.join(projectRoot, "demo-fixtures"),
    path.join(projectRoot, "node_modules")
  ];

  if (protectedPaths.some((protectedPath) => isSamePath(backupRoot, protectedPath))) {
    throw new Error("Backup root cannot be the project root or node_modules.");
  }

  if (protectedPaths.some((protectedPath) => isSameOrContainsPath(backupRoot, protectedPath))) {
    throw new Error("Backup root cannot contain the project source tree or protected application folders.");
  }

  if (isSameOrInsidePath(backupRoot, databaseDir)) {
    throw new Error("Backup root cannot be inside the active database directory.");
  }

  if (isSameOrInsidePath(backupRoot, uploadRoot)) {
    throw new Error("Backup root cannot be inside the active upload directory.");
  }

  if (isSameOrContainsPath(backupRoot, databasePath)) {
    throw new Error("Backup root cannot contain the active database file.");
  }

  if (isSameOrContainsPath(backupRoot, uploadRoot)) {
    throw new Error("Backup root cannot contain the active upload directory.");
  }
}

const mode = supportedModes.has(String(process.env.DENTAL_APP_MODE || "").trim().toLowerCase())
  ? String(process.env.DENTAL_APP_MODE).trim().toLowerCase()
  : "clean";

const defaultPathsByMode = {
  clean: {
    database: path.join("data", "dental.db"),
    uploadRoot: "uploads",
    backupRoot: "backups"
  },
  demo: {
    database: path.join("data", "dental-demo.db"),
    uploadRoot: "demo-uploads",
    backupRoot: "demo-backups"
  }
};

const defaults = defaultPathsByMode[mode];
const databasePath = resolveFromProject(process.env.DENTAL_DB_PATH, defaults.database);
const uploadRoot = resolveFromProject(process.env.DENTAL_UPLOAD_ROOT, defaults.uploadRoot);
const backupRoot = resolveFromProject(process.env.DENTAL_BACKUP_ROOT, defaults.backupRoot);

ensureSafeUploadRoot(uploadRoot, backupRoot);
ensureSafeBackupRoot(backupRoot, databasePath, uploadRoot);

const autoBackupEnabled = parseBooleanEnv(process.env.DENTAL_AUTO_BACKUP_ENABLED, mode === "clean");
const patientUploadDir = path.join(uploadRoot, "patients");
const treatmentUploadDir = path.join(uploadRoot, "treatments");

function getDisplayPath(targetPath) {
  const relativePath = path.relative(projectRoot, targetPath);
  if (relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return relativePath.split(path.sep).join("/");
  }

  return path.normalize(targetPath);
}

function ensureRuntimeDirectories() {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.mkdirSync(patientUploadDir, { recursive: true });
  fs.mkdirSync(treatmentUploadDir, { recursive: true });
}

export const runtimeConfig = {
  mode,
  projectRoot,
  databasePath,
  databaseDir: path.dirname(databasePath),
  uploadRoot,
  patientUploadDir,
  treatmentUploadDir,
  backupRoot,
  autoBackupEnabled,
  isDemoMode: mode === "demo",
  isCleanMode: mode === "clean",
  getDisplayPath,
  ensureRuntimeDirectories
};

export function assertAutomaticBackupsAllowed() {
  if (!runtimeConfig.autoBackupEnabled) {
    throw new Error("Automatic backup is disabled for the active application mode.");
  }

  if (runtimeConfig.isDemoMode) {
    throw new Error("Automatic backups are disabled in demo mode.");
  }
}

export function logRuntimeConfiguration() {
  console.log("[runtime] Mode:", runtimeConfig.mode);
  console.log("[runtime] Database:", runtimeConfig.getDisplayPath(runtimeConfig.databasePath));
  console.log("[runtime] Upload root:", runtimeConfig.getDisplayPath(runtimeConfig.uploadRoot));
  console.log("[runtime] Backup root:", runtimeConfig.getDisplayPath(runtimeConfig.backupRoot));
  console.log("[runtime] Automatic backup:", runtimeConfig.autoBackupEnabled ? "enabled" : "disabled");
}

export default runtimeConfig;
