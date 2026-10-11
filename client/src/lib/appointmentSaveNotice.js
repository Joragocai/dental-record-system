export function appointmentSaveNotice(mode) {
  if (mode === "edit") return { title: "Appointment Updated Successfully!", message: "The appointment changes have been saved to the patient's record." };
  if (mode === "create") return { title: "Appointment Saved Successfully!", message: "The appointment has been added to the patient's record." };
  return null;
}

export function isAppointmentSaveNotice(value) {
  return Boolean(value && typeof value === "object" && (value.kind === "appointment-created" || value.kind === "appointment-updated"));
}
