import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ExcelJS from "exceljs";

process.env.TZ = "UTC";

const runtimeRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "dental-v1-regression-"));
process.env.DENTAL_DB_PATH = path.join(runtimeRoot, "data", "dental-test.db");
process.env.DENTAL_UPLOAD_ROOT = path.join(runtimeRoot, "uploads");
process.env.DENTAL_EXPORT_ROOT = path.join(runtimeRoot, "exports");
process.env.DENTAL_BACKUP_ROOT = path.join(runtimeRoot, "backups");
process.env.DENTAL_AUTO_BACKUP_ENABLED = "true";
process.env.DENTAL_APP_MODE = "clean";

const [
  databaseModule,
  runtimeConfigModule,
  patientService,
  treatmentService,
  appointmentService,
  attachmentService,
  attachmentUtils,
  exportService,
  backupServiceModule
] = await Promise.all([
  import("../db/database.js"),
  import("../config/runtimeConfig.js"),
  import("./patientService.js"),
  import("./treatmentService.js"),
  import("./appointmentService.js"),
  import("./attachmentService.js"),
  import("../utils/attachmentUtils.js"),
  import("./exportService.js"),
  import("./backupService.js")
]);

const { default: db, dbPath, initializeDatabase } = databaseModule;
const { default: runtimeConfig } = runtimeConfigModule;
const { createPatient } = patientService;
const { createTreatment } = treatmentService;
const { createAppointment, listAppointmentsByPatientId } = appointmentService;
const { createAttachment } = attachmentService;
const {
  ATTACHMENT_UPLOAD_ERROR_MESSAGE,
  MAX_ATTACHMENT_FILE_SIZE_BYTES,
  attachmentUpload,
  buildAttachmentPath,
  deleteAttachmentFileIfPresent,
  isAllowedAttachmentFile,
  normalizeAttachmentType,
  resolveAttachmentAbsolutePath
} = attachmentUtils;
const {
  exportFullPatientRecordWorkbook,
  exportPatientTreatmentsWorkbook,
  exportPatientsWorkbook,
  exportTreatmentsWorkbook
} = exportService;
const { createSystemBackup, stopAutomaticBackupScheduler } = backupServiceModule;

initializeDatabase();

test.after(async () => {
  stopAutomaticBackupScheduler();
  db.close();
  await fsp.rm(runtimeRoot, { recursive: true, force: true });
});

async function clearDirectoryContents(directoryPath) {
  if (!fs.existsSync(directoryPath)) return;
  const entries = await fsp.readdir(directoryPath);
  await Promise.all(entries.map((entry) => fsp.rm(path.join(directoryPath, entry), { recursive: true, force: true })));
}

async function resetRuntimeState() {
  db.exec(`
    DELETE FROM attachments;
    DELETE FROM appointments;
    DELETE FROM treatments;
    DELETE FROM patients;
  `);

  await clearDirectoryContents(runtimeConfig.patientUploadDir);
  await clearDirectoryContents(runtimeConfig.treatmentUploadDir);
  await clearDirectoryContents(runtimeConfig.exportRoot);
  await clearDirectoryContents(runtimeConfig.backupRoot);
}

function buildPatientPayload(overrides = {}) {
  return {
    patient_id: "P-2026-0001",
    date_registered: "2026-08-10",
    last_name: "Rivera",
    first_name: "Alicia",
    middle_name: "",
    birthday: "1990-02-14",
    age: 36,
    gender: "Female",
    religion: "",
    nationality: "Filipino",
    nickname: "",
    patient_occupation: "",
    dental_insurance: "",
    insurance_effective_date: "",
    previous_dentist: "",
    last_dental_visit: "",
    mobile_number: "09170000001",
    email_address: "alicia@example.test",
    branch_location: "Main Branch",
    discount_eligibility: "Senior Citizen",
    home_address: "123 Sample Street",
    home_number: "",
    office_number: "",
    fax_number: "",
    is_minor: "No",
    parent_guardian_name: "",
    parent_guardian_occupation: "",
    referral_source: "",
    reason_for_consultation: "",
    good_health: "Yes",
    under_medical_treatment: "No",
    medical_treatment_details: "",
    serious_illness_history: "No",
    serious_illness_details: "",
    hospitalized_history: "No",
    hospitalization_details: "",
    taking_medications: "No",
    medication_details: "",
    uses_tobacco: "No",
    uses_alcohol_or_drugs: "No",
    disability_type: "",
    pregnant: "No",
    nursing: "No",
    birth_control_pills: "No",
    physician_name: "",
    physician_specialty: "",
    physician_office_number: "",
    physician_office_address: "",
    allergic_to_items: "No",
    blood_type: "O+",
    blood_pressure: "120/80",
    allergy_local_anesthetic: "No",
    local_anesthetic_details: "",
    allergy_penicillin: "No",
    allergy_sulfa: "No",
    allergy_aspirin: "No",
    allergy_latex: "No",
    allergy_others: "No",
    allergy_others_details: "",
    condition_high_blood_pressure: 0,
    condition_low_blood_pressure: 0,
    condition_epilepsy_convulsions: 0,
    condition_aids_hiv: 0,
    condition_std: 0,
    condition_stomach_troubles: 0,
    condition_fainting_seizure: 0,
    condition_rapid_weight_loss: 0,
    condition_radiation_therapy: 0,
    condition_joint_replacement: 0,
    condition_heart_surgery: 0,
    condition_heart_attack: 0,
    condition_thyroid_problem: 0,
    condition_heart_disease: 0,
    condition_heart_murmur: 0,
    condition_hepatitis_liver_disease: 0,
    condition_rheumatic_fever: 0,
    condition_hay_fever_allergies: 0,
    condition_respiratory_problems: 0,
    condition_hepatitis_jaundice: 0,
    condition_tuberculosis: 0,
    condition_swollen_ankles: 0,
    condition_kidney_disease: 0,
    condition_diabetes: 0,
    condition_chest_pain: 0,
    condition_stroke: 0,
    condition_cancer_tumors: 0,
    condition_anemia: 0,
    condition_angina: 0,
    condition_asthma: 0,
    condition_emphysema: 0,
    condition_bleeding_problems: 0,
    condition_blood_diseases: 0,
    condition_head_injuries: 0,
    condition_arthritis_rheumatism: 0,
    other_medical_condition: "No",
    other_medical_condition_details: "",
    medical_alert_summary: "Watch blood pressure during procedures.",
    ...overrides
  };
}

function buildTreatmentPayload(overrides = {}) {
  return {
    treatment_id: "T-2026-0001",
    patient_id: "P-2026-0001",
    treatment_date: "2026-08-10",
    tooth_numbers: "18",
    next_appointment: "2026-08-20",
    next_appointment_date: "2026-08-20",
    next_appointment_time: "09:45",
    procedure: "Root Canal",
    dentists: "Dr. Demo",
    amount_charged: 2500,
    discount_type: "Senior Citizen",
    discount_percent: 20,
    discount_amount: 500,
    net_amount_due: 2000,
    amount_paid: 500,
    balance: 1500,
    remarks: "Needs follow-up x-ray.",
    ...overrides
  };
}

function buildAppointmentPayload(overrides = {}) {
  return {
    patient_id: "P-2026-0001",
    appointment_date: "2026-08-12",
    appointment_time: "10:00",
    planned_procedure: "Consultation",
    notes: "",
    status: "Scheduled",
    ...overrides
  };
}

async function writeUploadFile(relativePath, contents = "fixture") {
  const absolutePath = resolveAttachmentAbsolutePath(relativePath);
  await fsp.mkdir(path.dirname(absolutePath), { recursive: true });
  await fsp.writeFile(absolutePath, contents);
  return absolutePath;
}

async function readWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook;
}

function getRowValues(sheet, rowNumber) {
  return sheet.getRow(rowNumber).values.slice(1);
}

test("patient appointment history keeps completed, cancelled, and no-show records in newest-first order", async () => {
  await resetRuntimeState();
  createPatient(buildPatientPayload(), "2026-08-10T08:00:00.000Z");

  createAppointment(buildAppointmentPayload({ appointment_date: "2026-08-12", appointment_time: "", planned_procedure: "", status: "Scheduled" }), "2026-08-10T08:05:00.000Z");
  createAppointment(buildAppointmentPayload({ appointment_date: "2026-08-12", appointment_time: "09:00", planned_procedure: "Cleaning", status: "Completed" }), "2026-08-10T08:06:00.000Z");
  createAppointment(buildAppointmentPayload({ appointment_date: "2026-08-11", appointment_time: "14:30", planned_procedure: "Filling", status: "Cancelled" }), "2026-08-10T08:07:00.000Z");
  createAppointment(buildAppointmentPayload({ appointment_date: "2026-08-10", appointment_time: "", planned_procedure: "Review", status: "No-show" }), "2026-08-10T08:08:00.000Z");

  const appointments = listAppointmentsByPatientId("P-2026-0001");

  assert.deepEqual(
    appointments.map((appointment) => ({
      date: appointment.appointment_date,
      time: appointment.appointment_time,
      procedure: appointment.planned_procedure,
      status: appointment.status
    })),
    [
      { date: "2026-08-12", time: "09:00", procedure: "Cleaning", status: "Completed" },
      { date: "2026-08-12", time: "", procedure: "", status: "Scheduled" },
      { date: "2026-08-11", time: "14:30", procedure: "Filling", status: "Cancelled" },
      { date: "2026-08-10", time: "", procedure: "Review", status: "No-show" }
    ]
  );

  assert.equal(appointments[1].notes, "");
});

test("attachment validation keeps the current allowlist, category requirement, size cap, and safe path handling", async () => {
  await resetRuntimeState();

  const allowedFiles = [
    { originalname: "xray.jpg", mimetype: "image/jpeg" },
    { originalname: "portrait.jpeg", mimetype: "image/jpeg" },
    { originalname: "scan.png", mimetype: "image/png" },
    { originalname: "intraoral.webp", mimetype: "image/webp" },
    { originalname: "consent.pdf", mimetype: "application/pdf" },
    { originalname: "notes.doc", mimetype: "application/msword" },
    { originalname: "summary.docx", mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    { originalname: "instructions.txt", mimetype: "text/plain" }
  ];

  for (const file of allowedFiles) {
    assert.equal(isAllowedAttachmentFile(file), true, file.originalname);
  }

  assert.equal(isAllowedAttachmentFile({ originalname: "malware.exe", mimetype: "application/x-msdownload" }), false);
  assert.equal(isAllowedAttachmentFile({ originalname: "mismatch.png", mimetype: "application/pdf" }), false);
  assert.equal(normalizeAttachmentType("").error, "Attachment Category is required.");
  assert.equal(normalizeAttachmentType(" ".repeat(3)).error, "Attachment Category is required.");
  assert.equal(normalizeAttachmentType("X-ray").value, "X-ray");
  assert.equal(attachmentUpload.limits.fileSize, MAX_ATTACHMENT_FILE_SIZE_BYTES);
  assert.equal(ATTACHMENT_UPLOAD_ERROR_MESSAGE.includes("Unsupported file type"), true);

  const patientPath = buildAttachmentPath("patient-file.pdf", "");
  const treatmentPath = buildAttachmentPath("treatment-file.pdf", "T-2026-0001");
  assert.equal(patientPath, "/uploads/patients/patient-file.pdf");
  assert.equal(treatmentPath, "/uploads/treatments/treatment-file.pdf");

  const patientAbsolutePath = await writeUploadFile(patientPath, "patient fixture");
  assert.equal(resolveAttachmentAbsolutePath(patientPath), patientAbsolutePath);
  assert.equal(resolveAttachmentAbsolutePath("/uploads/../../outside.txt"), null);

  const deletedFile = await deleteAttachmentFileIfPresent(patientPath);
  assert.deepEqual(deletedFile, { deleted: true });
  assert.equal(fs.existsSync(patientAbsolutePath), false);
});

test("patient export workbook keeps key patient fields and attachment sheet content", async (t) => {
  await resetRuntimeState();
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-10T10:15:00.000Z") });
  t.after(() => t.mock.timers.reset());

  createPatient(buildPatientPayload(), "2026-08-10T08:00:00.000Z");
  const attachmentPath = buildAttachmentPath("patient-consent.pdf", "");
  await writeUploadFile(attachmentPath, "consent");
  createAttachment({
    patient_id: "P-2026-0001",
    treatment_id: null,
    attachment_type: "Consent Form",
    original_filename: "patient-consent.pdf",
    stored_filename: "patient-consent.pdf",
    file_path: attachmentPath,
    mime_type: "application/pdf",
    file_size: 128,
    uploaded_at: "2026-08-10T08:30:00.000Z"
  });

  const { filePath, filename } = await exportPatientsWorkbook();
  const workbook = await readWorkbook(filePath);
  const patientSheet = workbook.getWorksheet("Patients");
  const attachmentSheet = workbook.getWorksheet("Patient Attachments");

  assert.equal(filename, "patients_export_2026-08-10.xlsx");
  assert.deepEqual(getRowValues(patientSheet, 1), [
    "Patient ID",
    "Date Registered",
    "Branch Location",
    "Last Name",
    "First Name",
    "Middle Name",
    "Birthday",
    "Age",
    "Gender",
    "Mobile Number",
    "Email Address",
    "Patient Classification",
    "Type of Disability",
    "Home Address",
    "Medical Alert Summary"
  ]);
  assert.equal(patientSheet.getCell("A2").value, "P-2026-0001");
  assert.equal(patientSheet.getCell("C2").value, "Main Branch");
  assert.equal(patientSheet.getCell("L2").value, "Senior Citizen");
  assert.equal(patientSheet.getCell("O2").value, "Blood Type: O+ | Patient classification: Senior Citizen");
  assert.equal(attachmentSheet.getCell("A2").value, "P-2026-0001");
  assert.equal(attachmentSheet.getCell("C2").value, "Consent Form");
  assert.deepEqual(attachmentSheet.getCell("F2").value, {
    text: "uploads/patients/patient-consent.pdf",
    hyperlink: `file:///${path.join(runtimeConfig.uploadRoot, "patients", "patient-consent.pdf").replace(/\\/g, "/")}`
  });
  assert.equal(attachmentSheet.getCell("G2").value, "Non-image attachment");
});

test("treatment export workbooks keep follow-up date and time fields in treatment sheets", async (t) => {
  await resetRuntimeState();
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-10T10:15:00.000Z") });
  t.after(() => t.mock.timers.reset());

  createPatient(buildPatientPayload(), "2026-08-10T08:00:00.000Z");
  createTreatment(buildTreatmentPayload(), "2026-08-10T08:10:00.000Z");

  const treatmentsExport = await exportTreatmentsWorkbook();
  const treatmentsWorkbook = await readWorkbook(treatmentsExport.filePath);
  const treatmentsSheet = treatmentsWorkbook.getWorksheet("Treatments");

  assert.equal(treatmentsExport.filename, "treatments_export_2026-08-10.xlsx");
  assert.equal(treatmentsSheet.getCell("F2").value instanceof Date, true);
  assert.equal(treatmentsSheet.getCell("G2").value, "09:45");
  assert.equal(treatmentsSheet.getCell("O2").value, "Needs follow-up x-ray.");

  const patientTreatmentsExport = await exportPatientTreatmentsWorkbook("P-2026-0001");
  const patientTreatmentsWorkbook = await readWorkbook(patientTreatmentsExport.filePath);
  const patientTreatmentsSheet = patientTreatmentsWorkbook.getWorksheet("Patient Treatments");

  assert.equal(patientTreatmentsExport.filename, "patient_P-2026-0001_treatments_2026-08-10.xlsx");
  assert.equal(patientTreatmentsSheet.getCell("A2").value instanceof Date, true);
  assert.equal(patientTreatmentsSheet.getCell("F2").value instanceof Date, true);
  assert.equal(patientTreatmentsSheet.getCell("G2").value, "09:45");
});

test("full patient record export keeps patient record, treatment history, and attachment worksheet structure", async (t) => {
  await resetRuntimeState();
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-10T10:15:00.000Z") });
  t.after(() => t.mock.timers.reset());

  createPatient(buildPatientPayload(), "2026-08-10T08:00:00.000Z");
  createTreatment(buildTreatmentPayload(), "2026-08-10T08:10:00.000Z");
  const treatmentAttachmentPath = buildAttachmentPath("treatment-note.txt", "T-2026-0001");
  await writeUploadFile(treatmentAttachmentPath, "follow-up note");
  createAttachment({
    patient_id: "P-2026-0001",
    treatment_id: "T-2026-0001",
    attachment_type: "Treatment Plan",
    original_filename: "treatment-note.txt",
    stored_filename: "treatment-note.txt",
    file_path: treatmentAttachmentPath,
    mime_type: "text/plain",
    file_size: 48,
    uploaded_at: "2026-08-10T08:30:00.000Z"
  });

  const { filePath, filename } = await exportFullPatientRecordWorkbook("P-2026-0001");
  const workbook = await readWorkbook(filePath);
  const patientRecordSheet = workbook.getWorksheet("Patient Record");
  const treatmentHistorySheet = workbook.getWorksheet("Treatment History");
  const treatmentAttachmentsSheet = workbook.getWorksheet("Treatment Attachments");

  assert.equal(filename, "patient_P-2026-0001_full_record_2026-08-10.xlsx");
  assert.equal(patientRecordSheet.getCell("A2").value, "patient_id");
  assert.equal(patientRecordSheet.getCell("B2").value, "P-2026-0001");
  assert.equal(treatmentHistorySheet.getCell("E2").value instanceof Date, true);
  assert.equal(treatmentHistorySheet.getCell("F2").value, "09:45");
  assert.equal(treatmentAttachmentsSheet.getCell("A2").value, "Treatment T-2026-0001");
  assert.equal(treatmentAttachmentsSheet.getCell("C6").value, "Treatment Plan");
  assert.equal(treatmentAttachmentsSheet.getCell("G6").value, "Non-image attachment");
});

test("manual backup includes database, uploads, exports, and manifest metadata using temp fictional fixtures", async () => {
  await resetRuntimeState();
  createPatient(buildPatientPayload(), "2026-08-10T08:00:00.000Z");
  createTreatment(buildTreatmentPayload(), "2026-08-10T08:10:00.000Z");
  createAppointment(buildAppointmentPayload(), "2026-08-10T08:20:00.000Z");

  const patientUploadPath = buildAttachmentPath("backup-patient.txt", "");
  const treatmentUploadPath = buildAttachmentPath("backup-treatment.txt", "T-2026-0001");
  await writeUploadFile(patientUploadPath, "patient upload");
  await writeUploadFile(treatmentUploadPath, "treatment upload");
  await fsp.writeFile(path.join(runtimeConfig.exportRoot, "existing-export.txt"), "export fixture");

  createAttachment({
    patient_id: "P-2026-0001",
    treatment_id: null,
    attachment_type: "Other Clinical Document",
    original_filename: "backup-patient.txt",
    stored_filename: "backup-patient.txt",
    file_path: patientUploadPath,
    mime_type: "text/plain",
    file_size: 64,
    uploaded_at: "2026-08-10T08:30:00.000Z"
  });

  const backup = await createSystemBackup({
    date: new Date("2026-08-10T11:00:00.000Z"),
    backupType: "manual"
  });

  const backupDirectory = path.join(runtimeConfig.backupRoot, backup.backup_name);
  const manifest = JSON.parse(await fsp.readFile(path.join(backupDirectory, "backup-manifest.json"), "utf8"));

  assert.equal(fs.existsSync(path.join(backupDirectory, "data", path.basename(dbPath))), true);
  assert.equal(fs.existsSync(path.join(backupDirectory, "uploads", "patients", "backup-patient.txt")), true);
  assert.equal(fs.existsSync(path.join(backupDirectory, "uploads", "treatments", "backup-treatment.txt")), true);
  assert.equal(fs.existsSync(path.join(backupDirectory, "exports", "existing-export.txt")), true);
  assert.deepEqual(manifest.includedPaths, ["data", "uploads", "exports"]);
  assert.equal(manifest.status, "success");
  assert.equal(backup.copied_items.exports, true);
  assert.equal(backup.verification.details.verifiedTables, true);
});

test("manual backup omits exports when the export directory is absent", async () => {
  await resetRuntimeState();
  createPatient(buildPatientPayload(), "2026-08-10T08:00:00.000Z");
  await fsp.rm(runtimeConfig.exportRoot, { recursive: true, force: true });

  const backup = await createSystemBackup({
    date: new Date("2026-08-10T11:30:00.000Z"),
    backupType: "manual"
  });

  const backupDirectory = path.join(runtimeConfig.backupRoot, backup.backup_name);
  const manifest = JSON.parse(await fsp.readFile(path.join(backupDirectory, "backup-manifest.json"), "utf8"));

  assert.equal(fs.existsSync(path.join(backupDirectory, "exports")), false);
  assert.deepEqual(manifest.includedPaths, ["data", "uploads"]);
  assert.equal(backup.copied_items.exports, false);
});
