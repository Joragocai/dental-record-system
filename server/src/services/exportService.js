import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listPatients, getPatientByPatientId } from "./patientService.js";
import { getTreatmentsByPatientId, listTreatments } from "./treatmentService.js";
import {
  getAllAttachmentsByPatientId,
  getAttachmentsByPatientId,
  getAttachmentsByTreatmentId,
  listPatientAttachments,
  listTreatmentAttachments
} from "./attachmentService.js";
import { timestampForFile } from "../utils/dateUtils.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "../../..");
const exportDir = path.join(rootDir, "exports");
fs.mkdirSync(exportDir, { recursive: true });

const supportedImageExtensions = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  gif: "gif"
};
const thumbnailWidth = 140;
const thumbnailHeight = 140;

function styleHeader(row) {
  row.font = { bold: true };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "DCE9E6" } };
}

function styleSectionHeader(row) {
  row.font = { bold: true, size: 12 };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "EEF4F4" } };
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

function parseDateValue(value) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed;
}

function getAttachmentAbsolutePath(filePath) {
  if (!filePath) return null;
  const relativePath = filePath.replace(/^\/+/, "").split("/").join(path.sep);
  return path.join(rootDir, relativePath);
}

function getAttachmentDisplayPath(filePath) {
  return filePath ? filePath.replace(/^\/+/, "") : "";
}

function getAttachmentLinkValue(filePath) {
  const absolutePath = getAttachmentAbsolutePath(filePath);
  const displayPath = getAttachmentDisplayPath(filePath);

  if (!absolutePath || !fs.existsSync(absolutePath)) return displayPath;

  return {
    text: displayPath,
    hyperlink: `file:///${absolutePath.replace(/\\/g, "/")}`
  };
}

function getImageExtension(attachment) {
  const candidate = path.extname(attachment.file_path || attachment.stored_filename || attachment.original_filename || "").replace(".", "").toLowerCase();
  return supportedImageExtensions[candidate] || null;
}

function canEmbedAttachmentImage(attachment) {
  const extension = getImageExtension(attachment);
  if (!extension) return false;

  const absolutePath = getAttachmentAbsolutePath(attachment.file_path);
  return Boolean(absolutePath && fs.existsSync(absolutePath));
}

function embedAttachmentThumbnail(workbook, worksheet, rowNumber, columnNumber, attachment) {
  try {
    if (!canEmbedAttachmentImage(attachment)) return false;

    const imageId = workbook.addImage({
      filename: getAttachmentAbsolutePath(attachment.file_path),
      extension: getImageExtension(attachment)
    });

    worksheet.getRow(rowNumber).height = 110;
    worksheet.addImage(imageId, {
      tl: { col: columnNumber - 1 + 0.1, row: rowNumber - 1 + 0.1 },
      ext: { width: thumbnailWidth, height: thumbnailHeight }
    });
    return true;
  } catch {
    return false;
  }
}

function applyDateFormats(worksheet, keys) {
  keys.forEach((key) => {
    const column = worksheet.columns.find((item) => item && item.key === key);
    if (column) column.numFmt = "mm/dd/yyyy";
  });
}

function applyDateTimeFormats(worksheet, keys) {
  keys.forEach((key) => {
    const column = worksheet.columns.find((item) => item && item.key === key);
    if (column) column.numFmt = "mm/dd/yyyy hh:mm AM/PM";
  });
}

function applyAmountFormats(worksheet, keys) {
  keys.forEach((key) => {
    const column = worksheet.columns.find((item) => item && item.key === key);
    if (column) column.numFmt = "0.00";
  });
}

function buildPatientLookup() {
  return new Map(listPatients().map((patient) => [patient.patient_id, patient]));
}

function buildTreatmentLookup() {
  return new Map(listTreatments().map((treatment) => [treatment.treatment_id, treatment]));
}

function addNoAttachmentsRow(sheet, message = "No attachments") {
  sheet.addRow({ attachment_category: message });
}

function addAttachmentTableRow(workbook, sheet, attachment, options = {}) {
  const row = sheet.addRow({
    patient_id: options.patient?.patient_id || attachment.patient_id || "",
    patient_name: options.patient?.display_name || "",
    treatment_id: options.treatment?.treatment_id || attachment.treatment_id || "",
    treatment_date: options.treatment?.treatment_date ? parseDateValue(options.treatment.treatment_date) : "",
    procedure: options.treatment?.procedure || "",
    attachment_category: attachment.attachment_type || "",
    original_filename: attachment.original_filename || "",
    uploaded_at: parseDateValue(attachment.uploaded_at),
    file_path: getAttachmentLinkValue(attachment.file_path),
    image_preview: ""
  });

  const imageColumnNumber = sheet.getColumn("image_preview").number;
  if (!embedAttachmentThumbnail(workbook, sheet, row.number, imageColumnNumber, attachment)) {
    row.getCell("image_preview").value = attachment.mime_type?.startsWith("image/") ? "Image preview unavailable" : "Non-image attachment";
  }
}

function populateAttachmentTableSheet(workbook, sheet, attachments, { includePatientInfo = false, includeTreatmentInfo = false, patientLookup, treatmentLookup, emptyMessage }) {
  sheet.columns = [
    ...(includePatientInfo
      ? [
          { header: "Patient ID", key: "patient_id", width: 16 },
          { header: "Patient Name", key: "patient_name", width: 28 }
        ]
      : []),
    ...(includeTreatmentInfo
      ? [
          { header: "Treatment ID", key: "treatment_id", width: 18 },
          { header: "Treatment Date", key: "treatment_date", width: 16 },
          { header: "Procedure", key: "procedure", width: 28 }
        ]
      : []),
    { header: "Attachment Category", key: "attachment_category", width: 24 },
    { header: "Original Filename", key: "original_filename", width: 28 },
    { header: "Uploaded Date", key: "uploaded_at", width: 22 },
    { header: "File Path", key: "file_path", width: 38 },
    { header: "Image Thumbnail", key: "image_preview", width: 24 }
  ];
  styleHeader(sheet.getRow(1));

  if (!attachments.length) {
    addNoAttachmentsRow(sheet, emptyMessage);
    return;
  }

  attachments.forEach((attachment) => {
    const treatment = attachment.treatment_id ? treatmentLookup?.get(attachment.treatment_id) : null;
    const patient = patientLookup?.get(attachment.patient_id) || treatmentLookup?.get(attachment.treatment_id)?.patient_id || null;
    addAttachmentTableRow(workbook, sheet, attachment, {
      patient: typeof patient === "string" ? patientLookup?.get(patient) : patient,
      treatment
    });
  });

  applyDateFormats(sheet, ["treatment_date"]);
  applyDateTimeFormats(sheet, ["uploaded_at"]);
}

function populateGroupedTreatmentAttachmentSheet(workbook, sheet, treatments, attachmentsByTreatmentId) {
  sheet.columns = [
    { header: "Label", key: "label", width: 24 },
    { header: "Value", key: "value", width: 34 },
    { header: "Attachment Category", key: "attachment_category", width: 24 },
    { header: "Original Filename", key: "original_filename", width: 28 },
    { header: "Uploaded Date", key: "uploaded_at", width: 22 },
    { header: "File Path", key: "file_path", width: 38 },
    { header: "Image Thumbnail", key: "image_preview", width: 24 }
  ];

  if (!treatments.length) {
    sheet.addRow({ label: "No treatments recorded." });
    return;
  }

  treatments.forEach((treatment) => {
    const sectionRow = sheet.addRow({ label: `Treatment ${treatment.treatment_id}`, value: treatment.procedure || "" });
    styleSectionHeader(sectionRow);
    sheet.addRow({ label: "Treatment Date", value: parseDateValue(treatment.treatment_date) });
    sheet.addRow({ label: "Patient ID", value: treatment.patient_id });

    const headerRow = sheet.addRow({
      attachment_category: "Attachment Category",
      original_filename: "Original Filename",
      uploaded_at: "Uploaded Date",
      file_path: "File Path",
      image_preview: "Image Thumbnail"
    });
    styleHeader(headerRow);

    const attachments = attachmentsByTreatmentId.get(treatment.treatment_id) || [];
    if (!attachments.length) {
      sheet.addRow({ attachment_category: "No attachments" });
      sheet.addRow({});
      return;
    }

    attachments.forEach((attachment) => {
      const row = sheet.addRow({
        attachment_category: attachment.attachment_type,
        original_filename: attachment.original_filename,
        uploaded_at: parseDateValue(attachment.uploaded_at),
        file_path: getAttachmentLinkValue(attachment.file_path),
        image_preview: ""
      });

      const imageColumnNumber = sheet.getColumn("image_preview").number;
      if (!embedAttachmentThumbnail(workbook, sheet, row.number, imageColumnNumber, attachment)) {
        row.getCell("image_preview").value = attachment.mime_type?.startsWith("image/") ? "Image preview unavailable" : "Non-image attachment";
      }
    });

    sheet.addRow({});
  });

  applyDateFormats(sheet, ["value"]);
  applyDateTimeFormats(sheet, ["uploaded_at"]);
}

export async function exportPatientsWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Patients");
  const patients = listPatients();
  const patientAttachments = listPatientAttachments();
  const patientLookup = buildPatientLookup();

  sheet.columns = [
    { header: "Patient ID", key: "patient_id" },
    { header: "Date Registered", key: "date_registered" },
    { header: "Branch Location", key: "branch_location" },
    { header: "Last Name", key: "last_name" },
    { header: "First Name", key: "first_name" },
    { header: "Middle Name", key: "middle_name" },
    { header: "Birthday", key: "birthday" },
    { header: "Age", key: "age" },
    { header: "Gender", key: "gender" },
    { header: "Mobile Number", key: "mobile_number" },
    { header: "Email Address", key: "email_address" },
    { header: "Discount Eligibility", key: "discount_eligibility" },
    { header: "Type of Disability", key: "disability_type" },
    { header: "Home Address", key: "home_address" },
    { header: "Medical Alert Summary", key: "medical_alert_summary" }
  ];
  styleHeader(sheet.getRow(1));
  patients.forEach((patient) =>
    sheet.addRow({
      ...patient,
      date_registered: parseDateValue(patient.date_registered),
      birthday: parseDateValue(patient.birthday)
    })
  );
  applyDateFormats(sheet, ["date_registered", "birthday"]);
  autoWidth(sheet);

  const attachmentSheet = workbook.addWorksheet("Patient Attachments");
  populateAttachmentTableSheet(workbook, attachmentSheet, patientAttachments, {
    includePatientInfo: true,
    includeTreatmentInfo: false,
    patientLookup,
    emptyMessage: "No patient attachments"
  });
  autoWidth(attachmentSheet, { patient_name: 30, original_filename: 30, file_path: 40, image_preview: 24 });

  const dateStamp = timestampForFile(new Date()).slice(0, 10);
  return saveWorkbook(workbook, `patients_export_${dateStamp}.xlsx`);
}

export async function exportTreatmentsWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Treatments");
  const treatments = listTreatments();
  const patientLookup = buildPatientLookup();
  const treatmentLookup = buildTreatmentLookup();
  const treatmentAttachments = listTreatmentAttachments();

  sheet.columns = [
    { header: "Treatment ID", key: "treatment_id" },
    { header: "Patient ID", key: "patient_id" },
    { header: "Treatment Date", key: "treatment_date" },
    { header: "Procedure", key: "procedure" },
    { header: "Dentist/s", key: "dentists" },
    { header: "Amount Charged", key: "amount_charged" },
    { header: "Discount Type", key: "discount_type" },
    { header: "Discount Percent", key: "discount_percent" },
    { header: "Discount Amount", key: "discount_amount" },
    { header: "Net Amount Due", key: "net_amount_due" },
    { header: "Amount Paid", key: "amount_paid" },
    { header: "Balance", key: "balance" },
    { header: "Remarks", key: "remarks" }
  ];
  styleHeader(sheet.getRow(1));
  treatments.forEach((treatment) =>
    sheet.addRow({
      ...treatment,
      treatment_date: parseDateValue(treatment.treatment_date)
    })
  );
  applyDateFormats(sheet, ["treatment_date"]);
  applyAmountFormats(sheet, ["amount_charged", "discount_percent", "discount_amount", "net_amount_due", "amount_paid", "balance"]);
  autoWidth(sheet);

  const attachmentSheet = workbook.addWorksheet("Treatment Attachments");
  populateAttachmentTableSheet(workbook, attachmentSheet, treatmentAttachments, {
    includePatientInfo: true,
    includeTreatmentInfo: true,
    patientLookup,
    treatmentLookup,
    emptyMessage: "No treatment attachments"
  });
  autoWidth(attachmentSheet, {
    patient_name: 30,
    procedure: 28,
    original_filename: 30,
    file_path: 40,
    image_preview: 24
  });

  const dateStamp = timestampForFile(new Date()).slice(0, 10);
  return saveWorkbook(workbook, `treatments_export_${dateStamp}.xlsx`);
}

export async function exportPatientTreatmentsWorkbook(patientId) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Patient Treatments");
  const treatments = getTreatmentsByPatientId(patientId);
  const patient = getPatientByPatientId(patientId);
  const treatmentLookup = new Map(treatments.map((treatment) => [treatment.treatment_id, treatment]));
  const treatmentAttachments = treatments.flatMap((treatment) => getAttachmentsByTreatmentId(treatment.treatment_id));

  sheet.columns = [
    { header: "Treatment Date", key: "treatment_date" },
    { header: "Treatment ID", key: "treatment_id" },
    { header: "Procedure", key: "procedure" },
    { header: "Dentist/s", key: "dentists" },
    { header: "Tooth No./s", key: "tooth_numbers" },
    { header: "Amount Charged", key: "amount_charged" },
    { header: "Discount Type", key: "discount_type" },
    { header: "Discount Percent", key: "discount_percent" },
    { header: "Discount Amount", key: "discount_amount" },
    { header: "Net Amount Due", key: "net_amount_due" },
    { header: "Amount Paid", key: "amount_paid" },
    { header: "Balance", key: "balance" },
    { header: "Remarks", key: "remarks" }
  ];
  styleHeader(sheet.getRow(1));
  treatments.forEach((treatment) =>
    sheet.addRow({
      ...treatment,
      treatment_date: parseDateValue(treatment.treatment_date)
    })
  );
  applyDateFormats(sheet, ["treatment_date"]);
  applyAmountFormats(sheet, ["amount_charged", "discount_percent", "discount_amount", "net_amount_due", "amount_paid", "balance"]);
  autoWidth(sheet);

  const attachmentSheet = workbook.addWorksheet("Treatment Attachments");
  populateAttachmentTableSheet(workbook, attachmentSheet, treatmentAttachments, {
    includePatientInfo: true,
    includeTreatmentInfo: true,
    patientLookup: new Map(patient ? [[patient.patient_id, patient]] : []),
    treatmentLookup,
    emptyMessage: "No treatment attachments"
  });
  autoWidth(attachmentSheet, {
    patient_name: 30,
    procedure: 28,
    original_filename: 30,
    file_path: 40,
    image_preview: 24
  });

  const dateStamp = timestampForFile(new Date()).slice(0, 10);
  return saveWorkbook(workbook, `patient_${patientId}_treatments_${dateStamp}.xlsx`);
}

export async function exportFullPatientRecordWorkbook(patientId) {
  const workbook = new ExcelJS.Workbook();
  const patient = getPatientByPatientId(patientId);
  const treatments = getTreatmentsByPatientId(patientId);
  const patientAttachments = getAttachmentsByPatientId(patientId);
  const allAttachments = getAllAttachmentsByPatientId(patientId);
  const treatmentAttachmentsById = new Map(
    treatments.map((treatment) => [treatment.treatment_id, allAttachments.filter((attachment) => attachment.treatment_id === treatment.treatment_id)])
  );

  const patientSheet = workbook.addWorksheet("Patient Record");
  patientSheet.columns = [
    { header: "Field", key: "field", width: 28 },
    { header: "Value", key: "value", width: 48 }
  ];
  styleHeader(patientSheet.getRow(1));
  Object.entries(patient || {}).forEach(([key, value]) => {
    if (["id", "created_at", "updated_at"].includes(key)) return;
    const row = patientSheet.addRow({ field: key, value: key.includes("date") || key === "birthday" ? parseDateValue(value) : value ?? "" });
    if (key.includes("date") || key === "birthday") {
      row.getCell("value").numFmt = "mm/dd/yyyy";
    }
  });

  const treatmentSheet = workbook.addWorksheet("Treatment History");
  treatmentSheet.columns = [
    { header: "Treatment Date", key: "treatment_date" },
    { header: "Treatment ID", key: "treatment_id" },
    { header: "Procedure", key: "procedure" },
    { header: "Dentist/s", key: "dentists" },
    { header: "Amount Charged", key: "amount_charged" },
    { header: "Discount Type", key: "discount_type" },
    { header: "Discount Percent", key: "discount_percent" },
    { header: "Discount Amount", key: "discount_amount" },
    { header: "Net Amount Due", key: "net_amount_due" },
    { header: "Amount Paid", key: "amount_paid" },
    { header: "Balance", key: "balance" },
    { header: "Remarks", key: "remarks" }
  ];
  styleHeader(treatmentSheet.getRow(1));
  treatments.forEach((treatment) =>
    treatmentSheet.addRow({
      ...treatment,
      treatment_date: parseDateValue(treatment.treatment_date)
    })
  );
  applyDateFormats(treatmentSheet, ["treatment_date"]);
  applyAmountFormats(treatmentSheet, ["amount_charged", "discount_percent", "discount_amount", "net_amount_due", "amount_paid", "balance"]);
  autoWidth(treatmentSheet);

  const patientAttachmentSheet = workbook.addWorksheet("Patient Attachments");
  populateAttachmentTableSheet(workbook, patientAttachmentSheet, patientAttachments, {
    includePatientInfo: false,
    includeTreatmentInfo: false,
    patientLookup: new Map(patient ? [[patient.patient_id, patient]] : []),
    emptyMessage: "No patient attachments"
  });
  autoWidth(patientAttachmentSheet, { original_filename: 30, file_path: 40, image_preview: 24 });

  const treatmentAttachmentSheet = workbook.addWorksheet("Treatment Attachments");
  populateGroupedTreatmentAttachmentSheet(workbook, treatmentAttachmentSheet, treatments, treatmentAttachmentsById);
  autoWidth(treatmentAttachmentSheet, {
    value: 34,
    original_filename: 30,
    file_path: 40,
    image_preview: 24
  });

  const dateStamp = timestampForFile(new Date()).slice(0, 10);
  return saveWorkbook(workbook, `patient_${patientId}_full_record_${dateStamp}.xlsx`);
}
