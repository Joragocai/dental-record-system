import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import db, { initializeDatabase } from "../db/database.js";
import runtimeConfig from "../config/runtimeConfig.js";
import { createAppointment } from "../services/appointmentService.js";
import { createAttachment } from "../services/attachmentService.js";
import { getNextPatientId, getNextTreatmentId } from "../services/idService.js";
import { createPatient } from "../services/patientService.js";
import { createTreatment } from "../services/treatmentService.js";
import { buildAttachmentPath } from "../utils/attachmentUtils.js";
import { validateAppointmentPayload, validatePatientPayload, validateTreatmentPayload } from "../utils/validation.js";
import { buildDemoSeedData } from "./demoSeedData.js";
import { demoAttachmentTemplates } from "./demoAttachmentTemplates.js";
import { buildDemoTreatmentPayload, validateDemoSeedFixture } from "./demoSeedValidation.js";
import { clearDemoDatabaseRecords } from "./demoDatabaseReset.js";
import { assertDemoBackupIdle, clearDemoBackupStatus } from "../services/backupService.js";
import { beginDemoMutation, endDemoMutation, isDemoMutationInProgress } from "./demoOperationState.js";
import {
  approvedDemoPaths,
  demoMarkerSchemaVersion,
  demoSeedVersion,
  ensureDemoRuntimePaths,
  expectedCounts,
  getComparablePath,
  getManilaTodayIso,
  manilaTimeZone
} from "./demoShared.js";

const treatmentDiscountDefaults = {
  None: 0,
  "Senior Citizen": 20,
  PWD: 20,
  "Senior Citizen/PWD": 20,
  Custom: 0
};

function toTimestampIso(isoDate, hour = 9, minute = 0) {
  return `${isoDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`;
}

function isSamePath(leftPath, rightPath) {
  return getComparablePath(leftPath) === getComparablePath(rightPath);
}

async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listRequiredTables() {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('patients', 'treatments', 'appointments', 'attachments') ORDER BY name")
    .all()
    .map((row) => row.name);
}

function getTableCount(tableName) {
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count || 0);
}

function getPreparedCounts() {
  return {
    patients: getTableCount("patients"),
    treatments: getTableCount("treatments"),
    appointments: getTableCount("appointments"),
    attachments: getTableCount("attachments")
  };
}

function countDemoAttachmentFiles() {
  const directories = [runtimeConfig.patientUploadDir, runtimeConfig.treatmentUploadDir];
  let count = 0;
  for (const directory of directories) {
    if (!fs.existsSync(directory)) continue;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isFile()) count += 1;
    }
  }
  return count;
}

function getDemoMarkerPayload(anchorDate) {
  return {
    schemaVersion: demoMarkerSchemaVersion,
    demoSeedVersion,
    state: "ready",
    seedCompletedAt: new Date().toISOString(),
    anchorDate,
    expectedPatientCount: expectedCounts.patients,
    expectedTreatmentCount: expectedCounts.treatments,
    expectedAppointmentCount: expectedCounts.appointments,
    expectedAttachmentCount: expectedCounts.attachments
  };
}

async function readDemoMarker() {
  if (!await pathExists(approvedDemoPaths.markerPath)) {
    return null;
  }

  const contents = await fsp.readFile(approvedDemoPaths.markerPath, "utf8");
  return JSON.parse(contents);
}

function getAttachmentAbsolutePathFromStoredName(ownerType, storedFilename) {
  return path.join(ownerType === "treatment" ? runtimeConfig.treatmentUploadDir : runtimeConfig.patientUploadDir, storedFilename);
}

function buildStoredFilename(seed) {
  const template = demoAttachmentTemplates[seed.fileKind];
  return `${seed.key}-${seed.attachmentType.toLowerCase().replace(/[^a-z0-9]+/g, "-")}${template.extension}`;
}

async function validateDemoAttachments() {
  const attachments = db.prepare("SELECT file_path, stored_filename, treatment_id FROM attachments ORDER BY id").all();
  for (const attachment of attachments) {
    const ownerType = attachment.treatment_id ? "treatment" : "patient";
    const absolutePath = getAttachmentAbsolutePathFromStoredName(ownerType, attachment.stored_filename);
    if (!await pathExists(absolutePath)) {
      throw new Error(`Demo attachment file is missing: ${attachment.stored_filename}`);
    }

    if (!isSamePath(path.dirname(absolutePath), ownerType === "treatment" ? runtimeConfig.treatmentUploadDir : runtimeConfig.patientUploadDir)) {
      throw new Error(`Demo attachment resolved outside the approved demo upload directories: ${attachment.stored_filename}`);
    }

    if (!String(attachment.file_path || "").startsWith("/uploads/")) {
      throw new Error(`Unexpected attachment path format: ${attachment.file_path}`);
    }
  }
}

function assertValidationResult(errors, recordLabel) {
  if (errors.length) {
    throw new Error(`${recordLabel} failed validation: ${errors.join(" | ")}`);
  }
}

function buildTreatmentFinancials(seed) {
  const amountCharged = Number(seed.amount_charged || 0);
  const baseDiscountPercent = Number(seed.discount_percent ?? treatmentDiscountDefaults[seed.discount_type] ?? 0);
  const discountPercent = seed.discount_type === "None" ? 0 : baseDiscountPercent;
  const discountAmount = Number((amountCharged * discountPercent / 100).toFixed(2));
  const netAmountDue = Number((amountCharged - discountAmount).toFixed(2));
  const amountPaid = Number(seed.amount_paid || 0);
  const balance = Number((netAmountDue - amountPaid).toFixed(2));

  return {
    amountCharged,
    discountPercent,
    discountAmount,
    netAmountDue,
    amountPaid,
    balance
  };
}

async function ensureDemoDirectories() {
  await fsp.mkdir(path.dirname(runtimeConfig.databasePath), { recursive: true });
  await fsp.mkdir(runtimeConfig.patientUploadDir, { recursive: true });
  await fsp.mkdir(runtimeConfig.treatmentUploadDir, { recursive: true });
  await fsp.mkdir(runtimeConfig.exportRoot, { recursive: true });
  await fsp.mkdir(runtimeConfig.backupRoot, { recursive: true });
}

async function writeDemoAttachmentFile(seed) {
  const template = demoAttachmentTemplates[seed.fileKind];
  if (!template) {
    throw new Error(`Unsupported demo attachment template: ${seed.fileKind}`);
  }

  const storedFilename = buildStoredFilename(seed);
  const absolutePath = getAttachmentAbsolutePathFromStoredName(seed.ownerType, storedFilename);
  const buffer = template.buildBuffer(seed);
  await fsp.writeFile(absolutePath, buffer);
  return {
    storedFilename,
    absolutePath,
    originalFilename: `${seed.key}${template.extension}`,
    mimeType: template.mimeType,
    fileSize: buffer.length
  };
}

function resolveOwnerIds(seed, patientByKey, treatmentByKey) {
  if (seed.ownerType === "patient") {
    const patient = patientByKey.get(seed.ownerKey);
    if (!patient) {
      throw new Error(`Unknown patient attachment owner: ${seed.ownerKey}`);
    }
    return { patientId: patient.patient_id, treatmentId: null };
  }

  const treatment = treatmentByKey.get(seed.ownerKey);
  if (!treatment) {
    throw new Error(`Unknown treatment attachment owner: ${seed.ownerKey}`);
  }

  return { patientId: treatment.patient_id, treatmentId: treatment.treatment_id };
}

async function createDemoDataset(anchorDate) {
  const demoData = validateDemoSeedFixture(buildDemoSeedData(anchorDate));
  const createdFiles = [];
  const patientByKey = new Map();
  const treatmentByKey = new Map();

  try {
    db.exec("BEGIN");

    for (const [index, seed] of demoData.patients.entries()) {
      const patientId = getNextPatientId(new Date(`${anchorDate}T09:00:00`));
      const dateRegistered = demoData.addDays(anchorDate, seed.date_registered_offset);
      const { errors, data } = validatePatientPayload({
        ...seed,
        patient_id: patientId,
        date_registered: dateRegistered,
        birthday: seed.birthday
      });
      assertValidationResult(errors, `Patient ${index + 1}`);
      const patient = createPatient(data, toTimestampIso(dateRegistered, 9, index));
      patientByKey.set(seed.key, patient);
    }

    for (const [index, seed] of demoData.treatments.entries()) {
      const patient = patientByKey.get(seed.patientKey);
      if (!patient) {
        throw new Error(`Unknown treatment patient key: ${seed.patientKey}`);
      }

      const treatmentDate = demoData.addDays(anchorDate, seed.dateOffset);
      const treatmentId = getNextTreatmentId(new Date(`${anchorDate}T10:00:00`));
      const { errors, data } = validateTreatmentPayload(buildDemoTreatmentPayload(seed, {
        patientId: patient.patient_id,
        treatmentId,
        anchorDate,
        addDays: demoData.addDays
      }));
      assertValidationResult(errors, `Treatment ${index + 1}`);
      const treatment = createTreatment(data, toTimestampIso(treatmentDate, 10, index));
      treatmentByKey.set(seed.key, treatment);
    }

    for (const [index, seed] of demoData.appointments.entries()) {
      const patient = patientByKey.get(seed.patientKey);
      if (!patient) {
        throw new Error(`Unknown appointment patient key: ${seed.patientKey}`);
      }

      const appointmentDate = demoData.addDays(anchorDate, seed.dateOffset);
      const { errors, data } = validateAppointmentPayload({
        patient_id: patient.patient_id,
        appointment_date: appointmentDate,
        appointment_time: seed.appointment_time,
        planned_procedure: seed.planned_procedure,
        notes: seed.notes,
        status: seed.status
      });
      assertValidationResult(errors, `Appointment ${index + 1}`);
      createAppointment(data, toTimestampIso(appointmentDate, 11, index));
    }

    for (const [index, seed] of demoData.attachments.entries()) {
      const owner = resolveOwnerIds(seed, patientByKey, treatmentByKey);
      const file = await writeDemoAttachmentFile(seed);
      createdFiles.push(file.absolutePath);
      createAttachment({
        patient_id: owner.patientId,
        treatment_id: owner.treatmentId,
        attachment_type: seed.attachmentType,
        original_filename: file.originalFilename,
        stored_filename: file.storedFilename,
        file_path: buildAttachmentPath(file.storedFilename, owner.treatmentId),
        mime_type: file.mimeType,
        file_size: file.fileSize,
        uploaded_at: toTimestampIso(anchorDate, 12, index)
      });
    }

    db.exec("COMMIT");
    return demoData.counts;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Best effort rollback.
    }

    await Promise.all(createdFiles.map(async (filePath) => {
      try {
        await fsp.unlink(filePath);
      } catch {
        // Best effort cleanup for failed demo preparation.
      }
    }));

    throw error;
  }
}

async function validatePreparedDemoEnvironment(marker) {
  if (!await pathExists(runtimeConfig.databasePath)) {
    throw new Error("Demo database is missing. Run npm run demo:reset.");
  }

  const tables = await listRequiredTables();
  if (tables.length !== 4) {
    throw new Error("Demo database schema is incomplete. Run npm run demo:reset.");
  }

  const quickCheck = db.prepare("PRAGMA quick_check").all();
  if (!quickCheck.every((row) => row.quick_check === "ok")) {
    throw new Error("Demo database quick_check failed. Run npm run demo:reset.");
  }

  const foreignKeyViolations = db.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeyViolations.length) {
    throw new Error("Demo database has foreign-key violations. Run npm run demo:reset.");
  }

  const counts = getPreparedCounts();
  if (counts.patients < marker.expectedPatientCount || counts.treatments < marker.expectedTreatmentCount || counts.appointments < marker.expectedAppointmentCount || counts.attachments < marker.expectedAttachmentCount) {
    throw new Error("Demo database record counts are incomplete. Run npm run demo:reset.");
  }

  await validateDemoAttachments();

  return counts;
}

export async function prepareDemoEnvironment() {
  ensureDemoRuntimePaths();

  const databaseExists = await pathExists(runtimeConfig.databasePath);
  const marker = await readDemoMarker();

  if (marker && (!databaseExists)) {
    throw new Error("Demo marker exists but the demo database is missing. Run npm run demo:reset.");
  }

  if (databaseExists && !marker) {
    const tables = await listRequiredTables();
    if (tables.length > 0) {
      throw new Error("Demo database exists without a demo marker. Run npm run demo:reset.");
    }
  }

  if (marker) {
    if (marker.schemaVersion !== demoMarkerSchemaVersion) {
      throw new Error("Demo environment marker schema is unsupported. Please inspect the demo database.");
    }

    // Existing fictional records stay usable after a fixture update until Demo Fill is selected.

    if (marker.state === "empty") {
      initializeDatabase();
      const counts = getPreparedCounts();
      if (Object.values(counts).some((count) => count !== 0)) {
        throw new Error("Empty demo marker found with existing records. Use the dashboard controls to reset demo data.");
      }
      return { status: "empty", anchorDate: null, counts, attachmentFiles: countDemoAttachmentFiles() };
    }

    const counts = await validatePreparedDemoEnvironment(marker);
    return {
      status: "ready",
      anchorDate: marker.anchorDate,
      counts,
      attachmentFiles: countDemoAttachmentFiles()
    };
  }

  const anchorDate = getManilaTodayIso();
  await ensureDemoDirectories();
  initializeDatabase();

  let counts;
  try {
    counts = await createDemoDataset(anchorDate);
    const markerPayload = getDemoMarkerPayload(anchorDate);
    await fsp.writeFile(approvedDemoPaths.markerPath, `${JSON.stringify(markerPayload, null, 2)}\n`, "utf8");
    const validatedCounts = await validatePreparedDemoEnvironment(markerPayload);
    return {
      status: "created",
      anchorDate,
      counts: validatedCounts,
      attachmentFiles: countDemoAttachmentFiles()
    };
  } catch (error) {
    if (await pathExists(approvedDemoPaths.markerPath)) {
      try {
        await fsp.unlink(approvedDemoPaths.markerPath);
      } catch {
        // Best effort marker cleanup.
      }
    }
    throw error;
  }
}

export function getDemoRuntimeSummary() {
  ensureDemoRuntimePaths();
  return {
    database: runtimeConfig.getDisplayPath(runtimeConfig.databasePath),
    uploads: runtimeConfig.getDisplayPath(runtimeConfig.uploadRoot),
    exports: runtimeConfig.getDisplayPath(runtimeConfig.exportRoot),
    backups: runtimeConfig.getDisplayPath(runtimeConfig.backupRoot),
    marker: runtimeConfig.getDisplayPath(approvedDemoPaths.markerPath)
  };
}

export { isDemoMutationInProgress };

export async function runExclusiveDemoMutation(operation) {
  ensureDemoRuntimePaths();
  beginDemoMutation();
  try {
    assertDemoBackupIdle();
    return await operation();
  } finally {
    endDemoMutation();
  }
}

async function assertSafeDemoArtifacts() {
  ensureDemoRuntimePaths();

  const paths = [
    runtimeConfig.databaseDir,
    approvedDemoPaths.databasePath,
    approvedDemoPaths.markerPath,
    runtimeConfig.uploadRoot,
    runtimeConfig.patientUploadDir,
    runtimeConfig.treatmentUploadDir,
    runtimeConfig.exportRoot,
    runtimeConfig.backupRoot
  ];

  for (const target of paths) {
    let stats;
    try {
      stats = await fsp.lstat(target);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (stats.isSymbolicLink()) {
      throw new Error("Refusing to reset a demo path that is a symbolic link: " + runtimeConfig.getDisplayPath(target));
    }
  }
}

async function emptyDemoArtifactFolders() {
  for (const directory of [runtimeConfig.uploadRoot, runtimeConfig.exportRoot, runtimeConfig.backupRoot]) {
    let entries;
    try {
      entries = await fsp.readdir(directory);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      await fsp.rm(path.join(directory, entry), { recursive: true, force: true });
    }
  }
  await ensureDemoDirectories();
}

async function resetDemoRecordsToEmpty() {
  await assertSafeDemoArtifacts();
  initializeDatabase();

  clearDemoDatabaseRecords(db);

  await emptyDemoArtifactFolders();
  clearDemoBackupStatus();
  const marker = {
    schemaVersion: demoMarkerSchemaVersion,
    demoSeedVersion,
    state: "empty",
    clearedAt: new Date().toISOString()
  };
  await fsp.writeFile(approvedDemoPaths.markerPath, JSON.stringify(marker, null, 2) + "\n", "utf8");

  return { status: "empty", counts: getPreparedCounts() };
}

export function getDemoDataStatus() {
  ensureDemoRuntimePaths();
  const counts = getPreparedCounts();
  return {
    counts,
    isEmpty: Object.values(counts).every((count) => count === 0)
  };
}

export async function clearDemoData() {
  return runExclusiveDemoMutation(() => resetDemoRecordsToEmpty());
}

export async function loadDemoData() {
  return runExclusiveDemoMutation(async () => {
    // Validate all seed records before deleting any currently entered demo data.
    const anchorDate = getManilaTodayIso();
    validateDemoSeedFixture(buildDemoSeedData(anchorDate));
    await resetDemoRecordsToEmpty();
    try {
      await createDemoDataset(anchorDate);
      const marker = getDemoMarkerPayload(anchorDate);
      await fsp.writeFile(approvedDemoPaths.markerPath, JSON.stringify(marker, null, 2) + "\n", "utf8");
      const counts = await validatePreparedDemoEnvironment(marker);
      return { status: "ready", anchorDate, counts };
    } catch (error) {
      // A failed seed should leave a genuinely empty demo, not partially created data.
      try {
        await resetDemoRecordsToEmpty();
      } catch (cleanupError) {
        console.error("[demo] Recovery cleanup failed:", cleanupError);
      }
      throw error;
    }
  });
}

export const demoEnvironmentConfig = {
  demoMarkerSchemaVersion,
  demoSeedVersion,
  expectedCounts,
  approvedDemoPaths,
  manilaTimeZone
};
