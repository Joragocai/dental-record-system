import type { LegacyAppointmentRow } from "./appointmentMigration.js";

export function buildFictionalLegacyAppointmentRow(
  overrides: Partial<LegacyAppointmentRow> = {}
): LegacyAppointmentRow {
  return {
    id: 901,
    patient_id: "P-2026-0007",
    appointment_date: "2026-08-26",
    appointment_time: "09:15",
    planned_procedure: "Consultation",
    notes: "Bring previous x-rays",
    status: "Scheduled",
    created_at: "2026-08-20T08:00:00.000Z",
    updated_at: "2026-08-20T08:30:00.000Z",
    ...overrides
  };
}
