import { appointmentStatusOptions } from "./forms.js";

// Build a proposed change only; do not update records until the user confirms.
export function proposeAppointmentStatusChange(appointment, nextStatus) {
  if (!appointment?.id || !appointmentStatusOptions.includes(nextStatus)) return null;

  const currentStatus = appointment.status || "Scheduled";
  if (currentStatus === nextStatus) return null;

  return {
    appointmentId: appointment.id,
    currentStatus,
    nextStatus,
    appointmentDate: appointment.appointment_date || "",
    plannedProcedure: appointment.planned_procedure || ""
  };
}
