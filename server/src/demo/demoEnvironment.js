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

const demoAttachmentTemplates = {
  txt: {
    extension: ".txt",
    mimeType: "text/plain",
    buildBuffer(seed) {
      return Buffer.from(
        [
          "DEMO ONLY",
          "FICTIONAL RECORD",
          "NOT FOR CLINICAL USE",
          "",
          `Attachment: ${seed.attachmentType}`,
          `Owner Type: ${seed.ownerType}`,
          `Owner Key: ${seed.ownerKey}`,
          "",
          "This file is generated only for system testing and client presentation."
        ].join("\n"),
        "utf8"
      );
    }
  },
  pdf: {
    extension: ".pdf",
    mimeType: "application/pdf",
    buildBuffer(seed) {
      const content = `BT /F1 18 Tf 36 760 Td (DEMO ONLY) Tj 0 -24 Td (FICTIONAL RECORD) Tj 0 -24 Td (NOT FOR CLINICAL USE) Tj 0 -36 Td (${seed.attachmentType}) Tj ET`;
      const pdf = `%PDF-1.1
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${content.length} >> stream
${content}
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000063 00000 n 
0000000122 00000 n 
0000000271 00000 n 
0000000464 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
534
%%EOF`;
      return Buffer.from(pdf, "utf8");
    }
  },
  png: {
    extension: ".png",
    mimeType: "image/png",
    buildBuffer() {
      return Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z4FoAAAAASUVORK5CYII=",
        "base64"
      );
    }
  }
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
  const demoData = buildDemoSeedData(anchorDate);
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
      const financials = buildTreatmentFinancials(seed);
      const { errors, data } = validateTreatmentPayload({
        treatment_id: treatmentId,
        patient_id: patient.patient_id,
        treatment_date: treatmentDate,
        tooth_numbers: seed.tooth_numbers,
        next_appointment: seed.next_appointment_offset === null ? "" : demoData.addDays(anchorDate, seed.next_appointment_offset),
        next_appointment_date: seed.next_appointment_offset === null ? "" : demoData.addDays(anchorDate, seed.next_appointment_offset),
        next_appointment_time: seed.next_appointment_time,
        procedure: seed.procedure,
        dentists: seed.dentists,
        amount_charged: financials.amountCharged,
        discount_type: seed.discount_type,
        discount_percent: financials.discountPercent,
        discount_amount: financials.discountAmount,
        net_amount_due: financials.netAmountDue,
        amount_paid: financials.amountPaid,
        balance: financials.balance,
        remarks: seed.remarks
      });
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
    if (marker.schemaVersion !== demoMarkerSchemaVersion || marker.demoSeedVersion !== demoSeedVersion) {
      throw new Error("Demo environment uses an older seed version. Run npm run demo:reset.");
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

export const demoEnvironmentConfig = {
  demoMarkerSchemaVersion,
  demoSeedVersion,
  expectedCounts,
  approvedDemoPaths,
  manilaTimeZone
};
