import { emptyPatient } from "./forms.js";

const preservedMetadata = new Set(["patient_id", "date_registered"]);
const generatedFields = new Set(["age", "medical_alert_summary"]);

// Only user-editable values count as unsaved input. Generated patient details
// should never trigger an unnecessary confirmation.
export function hasPatientFieldsToClear(currentForm) {
  return Object.keys(emptyPatient).some((field) => {
    if (preservedMetadata.has(field) || generatedFields.has(field)) return false;
    return (currentForm[field] ?? emptyPatient[field]) !== emptyPatient[field];
  });
}

// Build a clean registration form only from verified fresh metadata.
// Keeping this separate makes retries safe if the next-ID request fails.
export function prepareNewPatientRegistration(metadata, previousPatientId = "") {
  const nextId = metadata?.patient_id;
  const nextDate = metadata?.date_registered;
  if (
    typeof nextId !== "string" ||
    !/^P-\d{4}-\d{4}$/.test(nextId) ||
    nextId === previousPatientId ||
    typeof nextDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)
  ) {
    throw new Error("A fresh Patient ID and registration date could not be generated. Please try again.");
  }
  return { ...emptyPatient, patient_id: nextId, date_registered: nextDate };
}

// Clear only the unsaved registration form. This does not call any API,
// change the patient identifier or registration date, or delete saved records.
// When editing a saved patient, compare editable values with the loaded record.
// Ignore generated summaries/IDs and normalize SQLite numeric flags to strings.
export function hasUnsavedPatientEdits(currentForm, baselineForm) {
  if (!baselineForm) return false;
  return Object.keys(emptyPatient).some((field) => {
    if (preservedMetadata.has(field) || generatedFields.has(field)) return false;
    const current = currentForm[field] ?? emptyPatient[field];
    const baseline = baselineForm[field] ?? emptyPatient[field];
    return String(current ?? "") !== String(baseline ?? "");
  });
}

export function clearPatientFormFields(currentForm) {
  return {
    ...emptyPatient,
    patient_id: currentForm.patient_id ?? "",
    date_registered: currentForm.date_registered ?? ""
  };
}
