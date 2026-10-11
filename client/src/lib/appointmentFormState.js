import { emptyAppointment } from "./forms.js";

// Only editable appointment values count as unsaved changes. This avoids
// warning about the default date/status or read-only appointment metadata.
export function hasUnsavedAppointmentChanges(currentForm, baselineForm) {
  if (!baselineForm) return false;
  return Object.keys(emptyAppointment).some((field) =>
    String(currentForm?.[field] ?? emptyAppointment[field]) !==
    String(baselineForm[field] ?? emptyAppointment[field])
  );
}
