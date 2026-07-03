import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listPatients, getPatientByPatientId } from "./patientService.js";
import { getTreatmentsByPatientId, listTreatments } from "./treatmentService.js";
import { getAttachmentsByPatientId } from "./attachmentService.js";
import { timestampForFile } from "../utils/dateUtils.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "../../..");
const exportDir = path.join(rootDir, "exports");
fs.mkdirSync(exportDir, { recursive: true });

function styleHeader(row) {
  row.font = { bold: true };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "DCE9E6" } };
}

function autoWidth(worksheet, widths = {}) {
  worksheet.columns.forEach((column) => {
    const explicit = widths[column.key];
    if (explicit) {
      column.width = explicit;
      return;
    }
    let max = 12;
    column.eachCell({ includeEmpty: true }, (cell) => {
      max = Math.max(max, String(cell.value ?? "").length + 2);
    });
    column.width = Math.min(max, 40);
  });
}

async function saveWorkbook(workbook, filename) {
  const filePath = path.join(exportDir, filename);
  await workbook.xlsx.writeFile(filePath);
  return { filePath, filename };
}

export async function exportPatientsWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Patients");
  const patients = listPatients();

  sheet.columns = [
    { header: "Patient ID", key: "patient_id" },
    { header: "Date Registered", key: "date_registered" },
    { header: "Last Name", key: "last_name" },
    { header: "First Name", key: "first_name" },
    { header: "Middle Name", key: "middle_name" },
    { header: "Birthday", key: "birthday" },
    { header: "Age", key: "age" },
    { header: "Gender", key: "gender" },
    { header: "Mobile Number", key: "mobile_number" },
    { header: "Email Address", key: "email_address" },
    { header: "Home Address", key: "home_address" },
    { header: "Medical Alert Summary", key: "medical_alert_summary" }
  ];
  styleHeader(sheet.getRow(1));
  patients.forEach((patient) => sheet.addRow(patient));
  autoWidth(sheet);

  const dateStamp = timestampForFile(new Date()).slice(0, 10);
  return saveWorkbook(workbook, `patients_export_${dateStamp}.xlsx`);
}

export async function exportTreatmentsWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Treatments");
  const treatments = listTreatments();

  sheet.columns = [
    { header: "Treatment ID", key: "treatment_id" },
    { header: "Patient ID", key: "patient_id" },
    { header: "Treatment Date", key: "treatment_date" },
    { header: "Procedure", key: "procedure" },
    { header: "Dentist/s", key: "dentists" },
    { header: "Amount Charged", key: "amount_charged" },
    { header: "Amount Paid", key: "amount_paid" },
    { header: "Balance", key: "balance" },
    { header: "Remarks", key: "remarks" }
  ];
  styleHeader(sheet.getRow(1));
  treatments.forEach((treatment) => sheet.addRow(treatment));
  ["F", "G", "H"].forEach((cell) => {
    sheet.getColumn(cell).numFmt = "0.00";
  });
  autoWidth(sheet);

  const dateStamp = timestampForFile(new Date()).slice(0, 10);
  return saveWorkbook(workbook, `treatments_export_${dateStamp}.xlsx`);
}

export async function exportPatientTreatmentsWorkbook(patientId) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Patient Treatments");
  const treatments = getTreatmentsByPatientId(patientId);

  sheet.columns = [
    { header: "Treatment Date", key: "treatment_date" },
    { header: "Treatment ID", key: "treatment_id" },
    { header: "Procedure", key: "procedure" },
    { header: "Dentist/s", key: "dentists" },
    { header: "Tooth No./s", key: "tooth_numbers" },
    { header: "Amount Charged", key: "amount_charged" },
    { header: "Amount Paid", key: "amount_paid" },
    { header: "Balance", key: "balance" },
    { header: "Remarks", key: "remarks" }
  ];
  styleHeader(sheet.getRow(1));
  treatments.forEach((treatment) => sheet.addRow(treatment));
  ["F", "G", "H"].forEach((cell) => {
    sheet.getColumn(cell).numFmt = "0.00";
  });
  autoWidth(sheet);

  const dateStamp = timestampForFile(new Date()).slice(0, 10);
  return saveWorkbook(workbook, `patient_${patientId}_treatments_${dateStamp}.xlsx`);
}

export async function exportFullPatientRecordWorkbook(patientId) {
  const workbook = new ExcelJS.Workbook();
  const patient = getPatientByPatientId(patientId);
  const treatments = getTreatmentsByPatientId(patientId);
  const attachments = getAttachmentsByPatientId(patientId);

  const patientSheet = workbook.addWorksheet("Patient Record");
  patientSheet.columns = [
    { header: "Field", key: "field", width: 28 },
    { header: "Value", key: "value", width: 48 }
  ];
  styleHeader(patientSheet.getRow(1));
  Object.entries(patient || {}).forEach(([key, value]) => {
    if (["id", "created_at", "updated_at"].includes(key)) return;
    patientSheet.addRow({ field: key, value: value ?? "" });
  });

  const treatmentSheet = workbook.addWorksheet("Treatment History");
  treatmentSheet.columns = [
    { header: "Treatment Date", key: "treatment_date" },
    { header: "Treatment ID", key: "treatment_id" },
    { header: "Procedure", key: "procedure" },
    { header: "Dentist/s", key: "dentists" },
    { header: "Amount Charged", key: "amount_charged" },
    { header: "Amount Paid", key: "amount_paid" },
    { header: "Balance", key: "balance" },
    { header: "Remarks", key: "remarks" }
  ];
  styleHeader(treatmentSheet.getRow(1));
  treatments.forEach((treatment) => treatmentSheet.addRow(treatment));
  ["E", "F", "G"].forEach((cell) => {
    treatmentSheet.getColumn(cell).numFmt = "0.00";
  });
  autoWidth(treatmentSheet);

  const attachmentSheet = workbook.addWorksheet("Attachments");
  attachmentSheet.columns = [
    { header: "Attachment Type", key: "attachment_type" },
    { header: "Original Filename", key: "original_filename" },
    { header: "File Path", key: "file_path" },
    { header: "Uploaded At", key: "uploaded_at" }
  ];
  styleHeader(attachmentSheet.getRow(1));
  attachments.forEach((attachment) => attachmentSheet.addRow(attachment));
  autoWidth(attachmentSheet);

  const dateStamp = timestampForFile(new Date()).slice(0, 10);
  return saveWorkbook(workbook, `patient_${patientId}_full_record_${dateStamp}.xlsx`);
}
