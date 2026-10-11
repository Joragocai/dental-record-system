// Pure presentation helpers keep the create/edit footer and treatment-history
// return state consistent across desktop tables and mobile cards.
export function getTreatmentFooterCopy(mode, isSaving = false, status = "") {
  const title = mode === "edit" ? "Update Treatment Record" : "Treatment Registration";
  const message = status || (isSaving
    ? "Saving treatment record..."
    : mode === "edit"
      ? "Review the changes before updating the record."
      : "Complete the required fields before saving.");
  return { title, message };
}

export function getTreatmentHistoryOriginState(mode, form, patient) {
  if (mode !== "create") return undefined;
  return { fromTreatmentEntry: true, treatmentDraft: { form, patient } };
}

export function getTreatmentAttachmentOriginState(originState) {
  return originState ? { ...originState, focusAttachments: true } : { focusAttachments: true };
}
