const TREATMENT_CREATED = "treatment-created";
const TREATMENT_UPDATED = "treatment-updated";

export function treatmentSaveNotice(mode) {
  if (mode === "edit") {
    return {
      title: "Treatment Updated Successfully!",
      message: "The treatment changes have been saved to the patient's record."
    };
  }
  if (mode === "create") {
    return {
      title: "Treatment Saved Successfully!",
      message: "The treatment has been added to the patient's record."
    };
  }
  return null;
}

// A successful save is sent through router state, then consumed on the
// destination page so a browser refresh cannot display it again.
export function consumeTreatmentSaveNotice(state) {
  if (!state || typeof state !== "object") return null;
  const kind = state.saveNotice?.kind;
  if (kind !== TREATMENT_CREATED && kind !== TREATMENT_UPDATED) return null;

  const { saveNotice: _consumed, ...remainingState } = state;
  return {
    notice: treatmentSaveNotice(kind === TREATMENT_UPDATED ? "edit" : "create"),
    remainingState: Object.keys(remainingState).length ? remainingState : null
  };
}
