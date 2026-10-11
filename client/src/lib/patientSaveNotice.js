// Keep this distinct from the new-patient dialog: it only applies to
// successful edits that redirect back to the patient's record.
export function isPatientUpdatedNotice(value) {
  return value?.kind === "patient-updated";
}

export function patientUpdatedNotice() {
  return {
    title: "Patient Updated Successfully!",
    message: "Changes to the patient's information have been saved."
  };
}
