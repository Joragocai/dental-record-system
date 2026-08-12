import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.resolve(currentDir, "../pages");
const componentsDir = path.resolve(currentDir, "../components");

async function readSourceFile(directory, fileName) {
  return fs.readFile(path.join(directory, fileName), "utf8");
}

test("print pages keep no-print controls outside the printable sheet", async () => {
  const [patientPage, treatmentPage, historyPage] = await Promise.all([
    readSourceFile(pagesDir, "PrintPatientPage.jsx"),
    readSourceFile(pagesDir, "PrintTreatmentPage.jsx"),
    readSourceFile(pagesDir, "PrintPatientHistoryPage.jsx")
  ]);

  assert.match(patientPage, /className="mb-6 flex items-center justify-between no-print"/);
  assert.match(treatmentPage, /className="mb-6 flex items-center justify-between no-print"/);
  assert.match(historyPage, /className="mb-6 flex items-center justify-between no-print"/);

  assert.match(patientPage, /data-print-root="patient-record"/);
  assert.match(treatmentPage, /data-print-root="treatment-record"/);
  assert.match(historyPage, /data-print-root="patient-treatment-history"/);
});

test("print pages preserve key V1 patient, treatment, and history content", async () => {
  const [patientPage, treatmentPage, historyPage, printableDocument] = await Promise.all([
    readSourceFile(pagesDir, "PrintPatientPage.jsx"),
    readSourceFile(pagesDir, "PrintTreatmentPage.jsx"),
    readSourceFile(pagesDir, "PrintPatientHistoryPage.jsx"),
    readSourceFile(componentsDir, "PrintableDocument.jsx")
  ]);

  assert.match(patientPage, /Patient Record Printout/);
  assert.match(patientPage, /Medical Alert Summary/);
  assert.match(patientPage, /<PrintableAttachments attachments=\{attachments\} \/>/);

  assert.match(treatmentPage, /Treatment Record Printout/);
  assert.match(treatmentPage, /Next Appointment Date/);
  assert.match(treatmentPage, /Next Appointment Time/);
  assert.match(treatmentPage, /<PrintableAttachments attachments=\{attachments\} title="Attachment Previews" showUploadedAt \/>/);

  assert.match(historyPage, /Full Patient Treatment History Printout/);
  assert.match(historyPage, /TreatmentHistoryTable treatments=\{treatments\}/);

  assert.match(printableDocument, /viewModel\.placeholderText/);
});
