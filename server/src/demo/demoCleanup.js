import fsp from "node:fs/promises";
import runtimeConfig from "../config/runtimeConfig.js";
import { approvedDemoPaths, ensureDemoRuntimePaths, getComparablePath } from "./demoShared.js";

async function removeApprovedDemoEntry(targetPath, removedPaths, cleanupTargets) {
  const expectedTargets = new Set(cleanupTargets.map((value) => getComparablePath(value)));
  if (!expectedTargets.has(getComparablePath(targetPath))) {
    throw new Error(`Unsafe demo cleanup target rejected: ${targetPath}`);
  }

  let stats;
  try {
    stats = await fsp.lstat(targetPath);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  if (stats.isSymbolicLink()) {
    try {
      await fsp.unlink(targetPath);
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    removedPaths.push(runtimeConfig.getDisplayPath(targetPath));
    return;
  }

  if (stats.isDirectory()) {
    try {
      await fsp.rm(targetPath, { recursive: true, force: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    removedPaths.push(runtimeConfig.getDisplayPath(targetPath));
    return;
  }

  try {
    await fsp.unlink(targetPath);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  removedPaths.push(runtimeConfig.getDisplayPath(targetPath));
}

export async function cleanupDemoEnvironment() {
  ensureDemoRuntimePaths();

  const removedPaths = [];
  const cleanupTargets = [
    approvedDemoPaths.databasePath,
    `${approvedDemoPaths.databasePath}-wal`,
    `${approvedDemoPaths.databasePath}-shm`,
    approvedDemoPaths.markerPath,
    approvedDemoPaths.uploadRoot,
    approvedDemoPaths.exportRoot,
    approvedDemoPaths.backupRoot
  ];

  for (const targetPath of cleanupTargets) {
    await removeApprovedDemoEntry(targetPath, removedPaths, cleanupTargets);
  }

  return { removedPaths };
}
