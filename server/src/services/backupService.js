import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import db, { dbPath } from "../db/database.js";
import runtimeConfig, { assertAutomaticBackupsAllowed } from "../config/runtimeConfig.js";

const packageMetadataPaths = [
  path.resolve(runtimeConfig.projectRoot, "package.json"),
  path.resolve(runtimeConfig.projectRoot, "server", "package.json")
];
const backupManifestFilename = "backup-manifest.json";
const backupLockFilename = ".backup.lock";
const backupLockMalformedStaleThresholdMs = 5 * 60 * 1000;
const automaticBackupFrequencyDays = 7;
const automaticBackupCheckIntervalMs = 24 * 60 * 60 * 1000;
const initialAutomaticBackupDelayMs = 15 * 1000;
const weeklyRetentionCount = 8;
const monthlyRetentionCount = 12;
const exportsDir = runtimeConfig.exportRoot;
const requiredVerificationTables = ["patients", "treatments", "appointments", "attachments"];

const backupState = {
  inProgress: false,
  activeBackupType: null,
  schedulerStarted: false,
  dailyTimer: null,
  initialTimer: null,
  statusRequestInFlight: null,
  lastResult: {
    backupType: null,
    status: null,
    error: ""
  }
};

let applicationVersionPromise;
const backupInternalTestHooks = {
  beforeLockWrite: null,
  beforeStaleLockDelete: null
};

function getComparablePath(targetPath) {
  return path.resolve(targetPath).replace(/[\\/]+/g, path.sep).toLowerCase();
}

function isSamePath(leftPath, rightPath) {
  return getComparablePath(leftPath) === getComparablePath(rightPath);
}

function isSameOrInsidePath(targetPath, parentPath) {
  const comparableTarget = getComparablePath(targetPath);
  const comparableParent = getComparablePath(parentPath);

  if (comparableTarget === comparableParent) return true;

  const relativePath = path.relative(comparableParent, comparableTarget);
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function isSameOrContainsPath(containerPath, childPath) {
  return isSameOrInsidePath(childPath, containerPath);
}

function escapeSqlitePath(filePath) {
  return String(filePath).replace(/'/g, "''");
}

function buildBackupTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}-${milliseconds}`;
}

function createBackupName(date = new Date()) {
  return `backup_${buildBackupTimestamp(date)}_${crypto.randomUUID().slice(0, 6)}`;
}

function createBackupId(backupType, date = new Date()) {
  return `${backupType}-${buildBackupTimestamp(date)}-${crypto.randomUUID().slice(0, 8)}`;
}

async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveApplicationVersion() {
  if (!applicationVersionPromise) {
    applicationVersionPromise = (async () => {
      for (const metadataPath of packageMetadataPaths) {
        try {
          const contents = await fsp.readFile(metadataPath, "utf8");
          const parsed = JSON.parse(contents);
          if (parsed.version) {
            return parsed.version;
          }
        } catch {
          // Try the next metadata file.
        }
      }

      return "unknown";
    })();
  }

  return applicationVersionPromise;
}

function getPublicBackupDestination() {
  const displayPath = runtimeConfig.getDisplayPath(runtimeConfig.backupRoot);
  if (!path.isAbsolute(displayPath)) return displayPath;
  return `External destination (${path.basename(runtimeConfig.backupRoot) || "backup-root"})`;
}

async function validateBackupDestination() {
  await fsp.mkdir(runtimeConfig.backupRoot, { recursive: true });
  await fsp.access(runtimeConfig.backupRoot, fs.constants.W_OK);

  const protectedDirectories = [
    runtimeConfig.projectRoot,
    path.join(runtimeConfig.projectRoot, "server"),
    path.join(runtimeConfig.projectRoot, "client"),
    path.join(runtimeConfig.projectRoot, "data"),
    path.join(runtimeConfig.projectRoot, "uploads"),
    path.join(runtimeConfig.projectRoot, "demo-uploads"),
    path.join(runtimeConfig.projectRoot, "exports"),
    path.join(runtimeConfig.projectRoot, "demo-exports"),
    path.join(runtimeConfig.projectRoot, "node_modules"),
    path.join(runtimeConfig.projectRoot, "demo-fixtures")
  ];

  if (protectedDirectories.some((protectedPath) => isSamePath(runtimeConfig.backupRoot, protectedPath))) {
    throw new Error("Backup destination cannot be a protected application directory.");
  }

  if (protectedDirectories.some((protectedPath) => isSameOrContainsPath(runtimeConfig.backupRoot, protectedPath))) {
    throw new Error("Backup destination cannot contain the project source tree or protected application folders.");
  }

  if (isSameOrInsidePath(runtimeConfig.backupRoot, runtimeConfig.databaseDir)) {
    throw new Error("Backup destination cannot be inside the active database directory.");
  }

  if (isSameOrInsidePath(runtimeConfig.backupRoot, runtimeConfig.uploadRoot)) {
    throw new Error("Backup destination cannot be inside the active upload directory.");
  }

  if (isSameOrInsidePath(runtimeConfig.backupRoot, runtimeConfig.exportRoot)) {
    throw new Error("Backup destination cannot be inside the active export directory.");
  }

  if (isSameOrContainsPath(runtimeConfig.backupRoot, runtimeConfig.databasePath)) {
    throw new Error("Backup destination cannot contain the active database file.");
  }

  if (isSameOrContainsPath(runtimeConfig.backupRoot, runtimeConfig.uploadRoot)) {
    throw new Error("Backup destination cannot contain the active upload directory.");
  }

  if (isSameOrContainsPath(runtimeConfig.backupRoot, runtimeConfig.exportRoot)) {
    throw new Error("Backup destination cannot contain the active export directory.");
  }

  if (isSameOrContainsPath(runtimeConfig.backupRoot, runtimeConfig.projectRoot)) {
    throw new Error("Backup destination cannot contain the project source tree.");
  }
}

function getLockFilePath() {
  return path.join(runtimeConfig.backupRoot, backupLockFilename);
}

function isProcessLikelyRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "EPERM") return true;
    return false;
  }
}

function isValidLockPayload(lockData) {
  return Boolean(
    lockData &&
    typeof lockData.lockId === "string" &&
    lockData.lockId.trim() &&
    Number.isInteger(Number(lockData.pid)) &&
    Number(lockData.pid) > 0 &&
    typeof lockData.startedAt === "string" &&
    lockData.startedAt.trim() &&
    typeof lockData.backupType === "string" &&
    lockData.backupType.trim()
  );
}

async function readLockFileStats(lockPath) {
  try {
    const stats = await fsp.stat(lockPath);
    return {
      mtimeMs: stats.mtimeMs,
      size: stats.size
    };
  } catch {
    return null;
  }
}

async function inspectBackupLock({ cleanupStale = false } = {}) {
  const lockPath = getLockFilePath();
  if (!await pathExists(lockPath)) {
    return {
      exists: false,
      isActive: false,
      isStale: false,
      isMalformed: false,
      lockPath
    };
  }

  const lockStats = await readLockFileStats(lockPath);
  if (!lockStats) {
    return {
      exists: true,
      isActive: true,
      isStale: false,
      isMalformed: true,
      lockPath
    };
  }

  let lockData = null;
  try {
    lockData = JSON.parse(await fsp.readFile(lockPath, "utf8"));
  } catch {
    lockData = null;
  }

  const lockAgeMs = Date.now() - lockStats.mtimeMs;
  const isMalformed = !isValidLockPayload(lockData);

  if (isMalformed) {
    const isRecentMalformed = !Number.isFinite(lockAgeMs) || lockAgeMs < backupLockMalformedStaleThresholdMs;

    if (cleanupStale && !isRecentMalformed) {
      if (typeof backupInternalTestHooks.beforeStaleLockDelete === "function") {
        await backupInternalTestHooks.beforeStaleLockDelete({
          lockPath,
          lockData: null,
          fileSignature: lockStats,
          reason: "old-malformed"
        });
      }

      const latestStats = await readLockFileStats(lockPath);
      if (
        latestStats &&
        latestStats.mtimeMs === lockStats.mtimeMs &&
        latestStats.size === lockStats.size
      ) {
        await fsp.rm(lockPath, { force: true });
        return {
          exists: false,
          isActive: false,
          isStale: true,
          isMalformed: true,
          lockPath,
          staleReason: "old-malformed"
        };
      }
    }

    return {
      exists: true,
      isActive: isRecentMalformed,
      isStale: !isRecentMalformed,
      isMalformed: true,
      lockPath,
      lockData: null,
      staleReason: isRecentMalformed ? null : "old-malformed",
      fileSignature: lockStats
    };
  }

  const isActive = isProcessLikelyRunning(Number(lockData.pid));
  const isStale = !isActive;

  if (cleanupStale && isStale) {
    if (typeof backupInternalTestHooks.beforeStaleLockDelete === "function") {
      await backupInternalTestHooks.beforeStaleLockDelete({
        lockPath,
        lockData,
        fileSignature: lockStats,
        reason: "dead-pid"
      });
    }

    const latestStats = await readLockFileStats(lockPath);
    if (
      latestStats &&
      latestStats.mtimeMs === lockStats.mtimeMs &&
      latestStats.size === lockStats.size
    ) {
      let latestLockData = null;
      try {
        latestLockData = JSON.parse(await fsp.readFile(lockPath, "utf8"));
      } catch {
        latestLockData = null;
      }

      if (
        latestLockData &&
        latestLockData.lockId === lockData.lockId &&
        Number(latestLockData.pid) === Number(lockData.pid)
      ) {
        await fsp.rm(lockPath, { force: true });
        return {
          exists: false,
          isActive: false,
          isStale: true,
          isMalformed: false,
          lockPath,
          staleReason: "dead-pid"
        };
      }
    }

    return {
      exists: true,
      isActive: true,
      isStale: false,
      isMalformed: false,
      lockPath,
      lockData,
      fileSignature: lockStats,
      staleReason: "replacement-race"
    };
  }

  return {
    exists: true,
    isActive,
    isStale,
    isMalformed: false,
    lockPath,
    lockData,
    fileSignature: lockStats
  };
}

async function tryAcquireBackupLock(backupType) {
  await validateBackupDestination();

  const lockPath = getLockFilePath();
  const lockPayload = {
    lockId: crypto.randomUUID(),
    pid: process.pid,
    startedAt: new Date().toISOString(),
    backupType
  };

  async function createLockFile() {
    let handle;
    let createdByCurrentAttempt = false;

    try {
      handle = await fsp.open(lockPath, "wx");
      createdByCurrentAttempt = true;
      if (typeof backupInternalTestHooks.beforeLockWrite === "function") {
        await backupInternalTestHooks.beforeLockWrite({
          lockPath,
          lockPayload,
          handle
        });
      }
      await handle.writeFile(JSON.stringify(lockPayload, null, 2));
      if (typeof handle.sync === "function") {
        await handle.sync();
      }
    } catch (error) {
      try {
        await handle?.close?.();
      } catch {
        // Ignore close errors while preserving the original create failure.
      }

      if (createdByCurrentAttempt) {
        try {
          const currentContents = JSON.parse(await fsp.readFile(lockPath, "utf8"));
          if (
            currentContents &&
            currentContents.lockId === lockPayload.lockId &&
            Number(currentContents.pid) === lockPayload.pid
          ) {
            await fsp.rm(lockPath, { force: true });
          }
        } catch {
          await fsp.rm(lockPath, { force: true }).catch(() => {});
        }
      }

      throw error;
    } finally {
      try {
        await handle?.close?.();
      } catch {
        // Ignore close errors after a successful write/sync path.
      }
    }

    return { lockPath, lockId: lockPayload.lockId, pid: lockPayload.pid };
  }

  let attempt = 0;
  while (attempt <= 1) {
    try {
      return await createLockFile();
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }

      const existingLock = await inspectBackupLock({ cleanupStale: true });
      if (!existingLock.exists) {
        attempt += 1;
        continue;
      }

      const conflictError = new Error("Another backup is already running.");
      conflictError.status = 409;
      throw conflictError;
    }
  }

  const conflictError = new Error("Another backup is already running.");
  conflictError.status = 409;
  throw conflictError;
}

async function releaseBackupLock(lockHandleInfo) {
  if (!lockHandleInfo?.lockPath) return;

  let existingLockData = null;
  try {
    existingLockData = JSON.parse(await fsp.readFile(lockHandleInfo.lockPath, "utf8"));
  } catch {
    return;
  }

  if (
    existingLockData &&
    existingLockData.lockId === lockHandleInfo.lockId &&
    Number(existingLockData.pid) === Number(lockHandleInfo.pid)
  ) {
    await fsp.rm(lockHandleInfo.lockPath, { force: true });
    return;
  }

  console.warn("[backup] Lock ownership mismatch detected during release; leaving lock file untouched.");
}

function getMonthKey(dateValue) {
  return String(dateValue || "").slice(0, 7);
}

function getRetentionPlan(entries) {
  const automaticSuccessful = entries
    .filter((entry) => entry.isAutomatic && entry.status === "success")
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));

  const weeklySet = new Set(automaticSuccessful.slice(0, weeklyRetentionCount).map((entry) => entry.absolutePath));

  const newestMonthlyRepresentativeByMonth = new Map();
  automaticSuccessful.forEach((entry) => {
    const monthKey = getMonthKey(entry.createdAt);
    if (!newestMonthlyRepresentativeByMonth.has(monthKey)) {
      newestMonthlyRepresentativeByMonth.set(monthKey, entry);
    }
  });

  const retainedMonthlyEntries = [...newestMonthlyRepresentativeByMonth.entries()]
    .sort((left, right) => right[0].localeCompare(left[0]))
    .slice(0, monthlyRetentionCount)
    .map(([, entry]) => entry);

  const monthlySet = new Set(retainedMonthlyEntries.map((entry) => entry.absolutePath));
  const retainedAutomaticSet = new Set([...weeklySet, ...monthlySet]);

  const deletableAutomaticEntries = automaticSuccessful.filter((entry) => !retainedAutomaticSet.has(entry.absolutePath));

  return {
    automaticSuccessful,
    weeklySet,
    monthlySet,
    retainedAutomaticSet,
    retainedMonthlyEntries,
    deletableAutomaticEntries,
    retainedWeeklyCount: weeklySet.size,
    retainedMonthlyCount: retainedMonthlyEntries.length
  };
}

async function readManifest(backupRootPath) {
  const manifestPath = path.join(backupRootPath, backupManifestFilename);
  if (!await pathExists(manifestPath)) return null;

  try {
    return JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  } catch {
    return null;
  }
}

async function writeManifest(backupRootPath, manifest) {
  const manifestPath = path.join(backupRootPath, backupManifestFilename);
  await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
}

async function collectDirectoryStats(directoryPath) {
  let fileCount = 0;
  let totalBytes = 0;

  if (!await pathExists(directoryPath)) {
    return { fileCount, totalBytes };
  }

  const stack = [directoryPath];
  while (stack.length) {
    const currentPath = stack.pop();
    const entries = await fsp.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.isFile()) {
        const stats = await fsp.stat(fullPath);
        fileCount += 1;
        totalBytes += stats.size;
      }
    }
  }

  return { fileCount, totalBytes };
}

async function setManifestStats(backupRootPath, manifest) {
  await writeManifest(backupRootPath, manifest);
  const { fileCount, totalBytes } = await collectDirectoryStats(backupRootPath);
  manifest.fileCount = fileCount;
  manifest.totalBytes = totalBytes;
  await writeManifest(backupRootPath, manifest);
}

async function copyDirectoryIfPresent(source, destination) {
  if (!await pathExists(source)) return false;
  await fsp.cp(source, destination, { recursive: true });
  return true;
}

function createSnapshotDatabase(destinationPath) {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  if (fs.existsSync(destinationPath)) {
    fs.rmSync(destinationPath, { force: true });
  }

  try {
    db.exec("PRAGMA wal_checkpoint(PASSIVE);");
  } catch {
    // Continue even when checkpointing is not available on the active filesystem.
  }

  db.exec(`VACUUM INTO '${escapeSqlitePath(destinationPath)}';`);
}

function verifyBackupDatabase(databasePathToVerify) {
  const verification = {
    canOpen: false,
    quickCheck: "not-run",
    tablesPresent: [],
    verifiedTables: false
  };

  let verificationDb;

  try {
    verificationDb = new DatabaseSync(databasePathToVerify);
    verification.canOpen = true;

    try {
      const quickCheckResult = verificationDb.prepare("PRAGMA quick_check;").all();
      verification.quickCheck = Array.isArray(quickCheckResult) && quickCheckResult[0]
        ? Object.values(quickCheckResult[0])[0]
        : "unknown";
    } catch {
      verification.quickCheck = "unsupported";
    }

    const tables = verificationDb
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name);

    verification.tablesPresent = requiredVerificationTables.filter((tableName) => tables.includes(tableName));
    verification.verifiedTables = verification.tablesPresent.length === requiredVerificationTables.length;
  } finally {
    verificationDb?.close?.();
  }

  if (!verification.canOpen) {
    throw new Error("Verification failed: backed-up database could not be opened.");
  }

  if (!["ok", "unsupported"].includes(verification.quickCheck)) {
    throw new Error(`Verification failed: PRAGMA quick_check returned ${verification.quickCheck}.`);
  }

  if (!verification.verifiedTables) {
    throw new Error("Verification failed: one or more required database tables are missing from the backup.");
  }

  return verification;
}

async function getBackupFolderEntries() {
  await validateBackupDestination();

  const entries = await fsp.readdir(runtimeConfig.backupRoot, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const absolutePath = path.join(runtimeConfig.backupRoot, entry.name);
    const manifest = await readManifest(absolutePath);
    const stats = await fsp.stat(absolutePath);
    const createdAt = manifest?.completedAt || manifest?.createdAt || stats.mtime.toISOString();
    const backupType = manifest?.backupType || "legacy";
    const status = manifest?.status || "legacy";

    results.push({
      name: entry.name,
      absolutePath,
      manifest,
      backupType,
      status,
      createdAt,
      isSuccessful: status === "success" || backupType === "legacy",
      isAutomatic: backupType === "automatic-weekly",
      isManualLike: backupType === "manual" || backupType === "legacy",
      isMonthlyArchive: Boolean(manifest?.isMonthlyArchive)
    });
  }

  return results.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

async function applyAutomaticRetention(entries = null) {
  const currentEntries = entries || await getBackupFolderEntries();
  const plan = getRetentionPlan(currentEntries);

  for (const entry of currentEntries) {
    if (!entry.isAutomatic || !entry.manifest || entry.status !== "success") continue;

    const shouldBeMonthly = plan.monthlySet.has(entry.absolutePath);
    if (entry.manifest.isMonthlyArchive !== shouldBeMonthly) {
      entry.manifest.isMonthlyArchive = shouldBeMonthly;
      await writeManifest(entry.absolutePath, entry.manifest);
    }
  }

  for (const entry of plan.deletableAutomaticEntries) {
    await fsp.rm(entry.absolutePath, { recursive: true, force: true });
  }

  return plan;
}

async function buildStatusSnapshot() {
  const entries = await getBackupFolderEntries();
  const lockStatus = await inspectBackupLock({ cleanupStale: false });
  const successfulEntries = entries.filter((entry) => entry.isSuccessful);
  const automaticSuccessfulEntries = entries.filter((entry) => entry.isAutomatic && entry.status === "success");
  const manualEntries = entries.filter((entry) => entry.backupType === "manual" && entry.status === "success");
  const latestEntry = entries[0] || null;
  const lastAutomaticEntry = automaticSuccessfulEntries[0] || null;
  const lastManualEntry = manualEntries[0] || null;
  const lastSuccessfulEntry = successfulEntries[0] || null;
  const now = new Date();
  const nextBackupDueAt = runtimeConfig.autoBackupEnabled
    ? lastAutomaticEntry
      ? new Date(new Date(lastAutomaticEntry.createdAt).getTime() + automaticBackupFrequencyDays * 86400000).toISOString()
      : now.toISOString()
    : null;
  const isBackupOverdue = Boolean(nextBackupDueAt && new Date(nextBackupDueAt).getTime() <= now.getTime());
  const retentionPlan = getRetentionPlan(entries);

  return {
    automaticBackupEnabled: runtimeConfig.autoBackupEnabled,
    automaticBackupFrequency: "Weekly",
    lastSuccessfulBackupAt: lastSuccessfulEntry?.createdAt || null,
    lastAutomaticBackupAt: lastAutomaticEntry?.createdAt || null,
    lastManualBackupAt: lastManualEntry?.createdAt || null,
    nextBackupDueAt,
    isBackupOverdue,
    lastBackupType: latestEntry?.backupType || backupState.lastResult.backupType,
    lastBackupStatus: latestEntry?.status || backupState.lastResult.status,
    lastBackupError: latestEntry?.manifest?.error?.message || backupState.lastResult.error || "",
    backupDestination: getPublicBackupDestination(),
    retainedWeeklyCount: retentionPlan.retainedWeeklyCount,
    retainedMonthlyCount: retentionPlan.retainedMonthlyCount,
    backupInProgress: backupState.inProgress || lockStatus.isActive
  };
}

async function createInitialManifest({ backupId, backupType, createdAt, isMonthlyArchive, includedPaths }) {
  return {
    schemaVersion: 1,
    backupId,
    backupType,
    isMonthlyArchive,
    sourceMode: runtimeConfig.mode,
    createdAt,
    completedAt: null,
    status: "in_progress",
    includedPaths,
    fileCount: 0,
    totalBytes: 0,
    verificationStatus: "pending",
    applicationVersion: await resolveApplicationVersion(),
    error: null
  };
}

async function createBackupInternal({ backupType, date }) {
  await validateBackupDestination();

  const backupName = createBackupName(date);
  const backupRootPath = path.join(runtimeConfig.backupRoot, backupName);
  if (await pathExists(backupRootPath)) {
    throw new Error(`Backup folder already exists: ${runtimeConfig.getDisplayPath(backupRootPath)}`);
  }

  await fsp.mkdir(backupRootPath, { recursive: true });

  const backupDataDir = path.join(backupRootPath, "data");
  const backupUploadsDir = path.join(backupRootPath, "uploads");
  const backupExportsDir = path.join(backupRootPath, "exports");
  const createdAt = date.toISOString();
  const existingEntries = await getBackupFolderEntries();
  const retentionPlanBeforeCreate = getRetentionPlan(existingEntries);
  const isMonthlyArchive = backupType === "automatic-weekly" && !retentionPlanBeforeCreate.monthlySet.has(
    existingEntries.find((entry) => getMonthKey(entry.createdAt) === getMonthKey(createdAt) && entry.isAutomatic && entry.status === "success")?.absolutePath || "__none__"
  );
  const manifest = await createInitialManifest({
    backupId: createBackupId(backupType, date),
    backupType,
    createdAt,
    isMonthlyArchive,
    includedPaths: ["data", "uploads", await pathExists(exportsDir) ? "exports" : null].filter(Boolean)
  });

  await writeManifest(backupRootPath, manifest);

  try {
    await fsp.mkdir(backupDataDir, { recursive: true });
    createSnapshotDatabase(path.join(backupDataDir, path.basename(dbPath)));

    if (!await pathExists(path.join(backupDataDir, path.basename(dbPath)))) {
      throw new Error("Backup incomplete: database snapshot could not be created.");
    }

    if (!await copyDirectoryIfPresent(runtimeConfig.uploadRoot, backupUploadsDir)) {
      throw new Error("Backup incomplete: uploads folder could not be copied.");
    }

    const copiedExports = await copyDirectoryIfPresent(exportsDir, backupExportsDir);
    const verification = verifyBackupDatabase(path.join(backupDataDir, path.basename(dbPath)));

    manifest.completedAt = new Date().toISOString();
    manifest.status = "success";
    manifest.verificationStatus = verification.quickCheck === "unsupported" ? "verified-with-table-check" : "verified";
    manifest.error = null;
    await setManifestStats(backupRootPath, manifest);

    if (backupType === "automatic-weekly") {
      await applyAutomaticRetention();
    }

    return {
      backup_name: backupName,
      backup_path: runtimeConfig.getDisplayPath(backupRootPath),
      copied_items: {
        database: [path.basename(dbPath)],
        uploads: ["patients", "treatments"],
        exports: copiedExports
      },
      verification: {
        snapshotMethod: "SQLite VACUUM INTO snapshot with optional WAL checkpoint",
        verificationMethod: "Open copied database, run PRAGMA quick_check when supported, and confirm required tables exist",
        details: verification
      }
    };
  } catch (error) {
    manifest.completedAt = new Date().toISOString();
    manifest.status = "failed";
    manifest.verificationStatus = "failed";
    manifest.error = {
      message: error.message || "Backup failed."
    };
    await setManifestStats(backupRootPath, manifest);
    throw error;
  }
}

export async function createSystemBackup(options = {}) {
  const date = options.date instanceof Date ? options.date : new Date();
  const backupType = options.backupType || "manual";

  if (!["manual", "automatic-weekly"].includes(backupType)) {
    throw new Error("Backup type is not supported.");
  }

  if (backupType === "automatic-weekly") {
    assertAutomaticBackupsAllowed();
  }

  if (runtimeConfig.isDemoMode && backupType === "automatic-weekly") {
    throw new Error("Automatic backups cannot run in demo mode.");
  }

  if (backupState.inProgress) {
    const conflictError = new Error("A backup is already in progress.");
    conflictError.status = 409;
    throw conflictError;
  }

  backupState.inProgress = true;
  backupState.activeBackupType = backupType;

  let lockPath;

  try {
    lockPath = await tryAcquireBackupLock(backupType);
    const result = await createBackupInternal({ backupType, date });
    backupState.lastResult = {
      backupType,
      status: "success",
      error: ""
    };
    return result;
  } catch (error) {
    if (error?.status !== 409) {
      backupState.lastResult = {
        backupType,
        status: "failed",
        error: error.message || "Backup failed."
      };
    }
    throw error;
  } finally {
    await releaseBackupLock(lockPath);
    backupState.inProgress = false;
    backupState.activeBackupType = null;
  }
}

export async function getBackupStatus() {
  if (backupState.statusRequestInFlight) {
    return backupState.statusRequestInFlight;
  }

  backupState.statusRequestInFlight = buildStatusSnapshot()
    .finally(() => {
      backupState.statusRequestInFlight = null;
    });

  return backupState.statusRequestInFlight;
}

export async function runAutomaticBackupDueCheck() {
  if (!runtimeConfig.autoBackupEnabled || runtimeConfig.isDemoMode) {
    return { skipped: true, reason: "automatic-backup-disabled" };
  }

  if (backupState.inProgress) {
    return { skipped: true, reason: "backup-in-progress" };
  }

  const status = await getBackupStatus();
  if (!status.isBackupOverdue) {
    return { skipped: true, reason: "not-due", nextBackupDueAt: status.nextBackupDueAt };
  }

  try {
    const backup = await createSystemBackup({ backupType: "automatic-weekly" });
    return { skipped: false, backup };
  } catch (error) {
    console.error("[backup] Automatic backup failed:", error.message);
    return { skipped: false, error: error.message || "Automatic backup failed." };
  }
}

export function startAutomaticBackupScheduler() {
  if (backupState.schedulerStarted) return;

  backupState.schedulerStarted = true;
  backupState.initialTimer = setTimeout(async () => {
    const result = await runAutomaticBackupDueCheck();
    if (result.error) {
      console.error("[backup] Initial automatic due-check error:", result.error);
    }
  }, initialAutomaticBackupDelayMs);

  backupState.dailyTimer = setInterval(async () => {
    const result = await runAutomaticBackupDueCheck();
    if (result.error) {
      console.error("[backup] Scheduled automatic due-check error:", result.error);
    }
  }, automaticBackupCheckIntervalMs);
}

export function stopAutomaticBackupScheduler() {
  if (backupState.initialTimer) {
    clearTimeout(backupState.initialTimer);
    backupState.initialTimer = null;
  }

  if (backupState.dailyTimer) {
    clearInterval(backupState.dailyTimer);
    backupState.dailyTimer = null;
  }

  backupState.schedulerStarted = false;
}

export const backupTestUtils = {
  getRetentionPlan,
  inspectBackupLock,
  tryAcquireBackupLock,
  releaseBackupLock,
  backupLockMalformedStaleThresholdMs,
  setInternalTestHooks(hooks = {}) {
    backupInternalTestHooks.beforeLockWrite = hooks.beforeLockWrite || null;
    backupInternalTestHooks.beforeStaleLockDelete = hooks.beforeStaleLockDelete || null;
  },
  resetInternalTestHooks() {
    backupInternalTestHooks.beforeLockWrite = null;
    backupInternalTestHooks.beforeStaleLockDelete = null;
  }
};

export { automaticBackupCheckIntervalMs, automaticBackupFrequencyDays, backupManifestFilename, backupLockFilename, initialAutomaticBackupDelayMs, packageMetadataPaths };
