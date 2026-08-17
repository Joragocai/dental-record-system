import type { LegacyTreatmentRow } from "./treatmentMigration.js";

export function buildFictionalLegacyTreatmentRow(
  overrides: Partial<LegacyTreatmentRow> = {}
): LegacyTreatmentRow {
  return {
    id: 501,
    treatment_id: "T-2026-0007",
    patient_id: "P-2026-0007",
    treatment_date: "2026-08-10",
    tooth_numbers: "14,15",
    next_appointment: "",
    next_appointment_date: "2026-08-24",
    next_appointment_time: "14:30",
    procedure: "Composite restoration",
    dentists: "Dr. Fiction / Dr. Sample",
    amount_charged: "1500.00",
    discount_type: "PWD",
    discount_percent: "20",
    discount_amount: "300.00",
    net_amount_due: "1200.00",
    amount_paid: "500.00",
    balance: "700.00",
    remarks: "Monitor sensitivity after one week",
    created_at: "2026-08-10T08:30:00.000Z",
    updated_at: "2026-08-10T09:00:00.000Z",
    ...overrides
  };
}
