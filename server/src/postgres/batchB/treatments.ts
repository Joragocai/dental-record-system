import type { QueryResultRow } from "pg";
import { normalizeNullablePgDateOnly, normalizePgDateOnly, type PgDateOnlyValue } from "../dateOnly.js";
import type { PgQueryExecutor } from "../pool.js";

export interface NewTreatmentRecord {
  id: string;
  treatmentCode: string;
  patientId: string;
  treatmentDate: string;
  toothNumbers: string | null;
  nextAppointmentDate: string | null;
  nextAppointmentTime: string | null;
  procedure: string;
  dentists: string;
  amountCharged: number;
  discountType: string;
  discountPercent: number;
  discountAmount: number;
  netAmountDue: number;
  amountPaid: number;
  balance: number;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LegacyTreatmentIdentityMapRecord {
  sourceSystem: string;
  legacyTreatmentRowId: number;
  legacyTreatmentCode: string;
  treatmentId: string;
  createdAt: string;
}

export interface LegacyTreatmentMigrationState {
  sourceSystem: string;
  legacyTreatmentRowId: number;
  legacyTreatmentCode: string;
  mappingCreatedAt: string;
  treatment: NewTreatmentRecord;
}

interface TreatmentRow extends QueryResultRow {
  id: string;
  treatment_code: string;
  patient_id: string;
  treatment_date: PgDateOnlyValue;
  tooth_numbers: string | null;
  next_appointment_date: PgDateOnlyValue | null;
  next_appointment_time: string | null;
  procedure: string;
  dentists: string;
  amount_charged: number | string;
  discount_type: string;
  discount_percent: number | string;
  discount_amount: number | string;
  net_amount_due: number | string;
  amount_paid: number | string;
  balance: number | string;
  remarks: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface LegacyTreatmentMigrationRow extends TreatmentRow {
  source_system: string;
  legacy_treatment_row_id: number | string;
  legacy_treatment_code: string;
  mapping_created_at: string | Date;
}

export const treatmentInsertColumns = [
  "id",
  "treatment_code",
  "patient_id",
  "treatment_date",
  "tooth_numbers",
  "next_appointment_date",
  "next_appointment_time",
  "procedure",
  "dentists",
  "amount_charged",
  "discount_type",
  "discount_percent",
  "discount_amount",
  "net_amount_due",
  "amount_paid",
  "balance",
  "remarks",
  "created_at",
  "updated_at"
] as const;

function mapNumericField(value: number | string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be numeric in PostgreSQL results.`);
  }

  return Number(parsed.toFixed(2));
}

function toIsoTimestamp(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

export function mapTreatmentRow(row: TreatmentRow): NewTreatmentRecord {
  return {
    id: String(row.id),
    treatmentCode: String(row.treatment_code),
    patientId: String(row.patient_id),
    treatmentDate: normalizePgDateOnly(row.treatment_date, "Treatment treatment_date"),
    toothNumbers: row.tooth_numbers === null ? null : String(row.tooth_numbers),
    nextAppointmentDate: normalizeNullablePgDateOnly(
      row.next_appointment_date,
      "Treatment next_appointment_date"
    ),
    nextAppointmentTime: row.next_appointment_time === null ? null : String(row.next_appointment_time),
    procedure: String(row.procedure),
    dentists: String(row.dentists),
    amountCharged: mapNumericField(row.amount_charged, "Treatment amount_charged"),
    discountType: String(row.discount_type),
    discountPercent: mapNumericField(row.discount_percent, "Treatment discount_percent"),
    discountAmount: mapNumericField(row.discount_amount, "Treatment discount_amount"),
    netAmountDue: mapNumericField(row.net_amount_due, "Treatment net_amount_due"),
    amountPaid: mapNumericField(row.amount_paid, "Treatment amount_paid"),
    balance: mapNumericField(row.balance, "Treatment balance"),
    remarks: row.remarks === null ? null : String(row.remarks),
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at)
  };
}

function mapLegacyTreatmentMigrationRow(row: LegacyTreatmentMigrationRow): LegacyTreatmentMigrationState {
  return {
    sourceSystem: String(row.source_system),
    legacyTreatmentRowId: Number(row.legacy_treatment_row_id),
    legacyTreatmentCode: String(row.legacy_treatment_code),
    mappingCreatedAt: toIsoTimestamp(row.mapping_created_at),
    treatment: mapTreatmentRow(row)
  };
}

function buildTreatmentInsertValues(treatment: NewTreatmentRecord): readonly unknown[] {
  return [
    treatment.id,
    treatment.treatmentCode,
    treatment.patientId,
    treatment.treatmentDate,
    treatment.toothNumbers,
    treatment.nextAppointmentDate,
    treatment.nextAppointmentTime,
    treatment.procedure,
    treatment.dentists,
    treatment.amountCharged,
    treatment.discountType,
    treatment.discountPercent,
    treatment.discountAmount,
    treatment.netAmountDue,
    treatment.amountPaid,
    treatment.balance,
    treatment.remarks,
    treatment.createdAt,
    treatment.updatedAt
  ];
}

export async function insertTreatment(
  executor: PgQueryExecutor,
  treatment: NewTreatmentRecord
): Promise<NewTreatmentRecord> {
  const placeholders = treatmentInsertColumns.map((_, index) => `$${index + 1}`).join(", ");
  const result = await executor.query<TreatmentRow>(
    `INSERT INTO treatments (${treatmentInsertColumns.join(", ")})
     VALUES (${placeholders})
     RETURNING *`,
    buildTreatmentInsertValues(treatment)
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Treatment insert did not return a row.");
  }

  return mapTreatmentRow(row);
}

export async function getTreatmentByCode(
  executor: PgQueryExecutor,
  treatmentCode: string
): Promise<NewTreatmentRecord | null> {
  const result = await executor.query<TreatmentRow>("SELECT * FROM treatments WHERE treatment_code = $1", [treatmentCode]);
  return result.rows[0] ? mapTreatmentRow(result.rows[0]) : null;
}

export async function insertLegacyTreatmentIdentityMap(
  executor: PgQueryExecutor,
  record: LegacyTreatmentIdentityMapRecord
): Promise<LegacyTreatmentIdentityMapRecord> {
  await executor.query(
    `INSERT INTO legacy_treatment_identity_map
       (source_system, legacy_treatment_row_id, legacy_treatment_code, treatment_id, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [record.sourceSystem, record.legacyTreatmentRowId, record.legacyTreatmentCode, record.treatmentId, record.createdAt]
  );

  return record;
}

export async function listLegacyTreatmentMigrationStates(
  executor: PgQueryExecutor,
  sourceSystem: string,
  legacyTreatmentRowId: number,
  legacyTreatmentCode: string
): Promise<LegacyTreatmentMigrationState[]> {
  const result = await executor.query<LegacyTreatmentMigrationRow>(
    `SELECT
       m.source_system,
       m.legacy_treatment_row_id,
       m.legacy_treatment_code,
       m.created_at AS mapping_created_at,
       t.*
     FROM legacy_treatment_identity_map m
     JOIN treatments t ON t.id = m.treatment_id
     WHERE m.source_system = $1
       AND (m.legacy_treatment_row_id = $2 OR m.legacy_treatment_code = $3)
     ORDER BY m.legacy_treatment_row_id ASC, m.legacy_treatment_code ASC`,
    [sourceSystem, legacyTreatmentRowId, legacyTreatmentCode]
  );

  return result.rows.map(mapLegacyTreatmentMigrationRow);
}
