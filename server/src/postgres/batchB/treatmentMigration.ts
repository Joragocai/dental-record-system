import crypto from "node:crypto";
import { listLegacyPatientMigrationStatesByCode } from "../batchA/patients.js";
import type { PgPoolManager, PgQueryExecutor } from "../pool.js";
import {
  getTreatmentByCode,
  insertLegacyTreatmentIdentityMap,
  insertTreatment,
  type LegacyTreatmentIdentityMapRecord,
  type LegacyTreatmentMigrationState,
  type NewTreatmentRecord,
  listLegacyTreatmentMigrationStates
} from "./treatments.js";

type LegacyMoneyValue = number | string | null;

export interface LegacyTreatmentRow {
  id: number;
  treatment_id: string;
  patient_id: string;
  treatment_date: string;
  tooth_numbers: string | null;
  next_appointment: string | null;
  next_appointment_date: string | null;
  next_appointment_time: string | null;
  procedure: string;
  dentists: string;
  amount_charged: LegacyMoneyValue;
  discount_type: string | null;
  discount_percent: LegacyMoneyValue;
  discount_amount: LegacyMoneyValue;
  net_amount_due: LegacyMoneyValue;
  amount_paid: LegacyMoneyValue;
  balance: LegacyMoneyValue;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface MappedTreatmentDraft {
  treatment: NewTreatmentRecord;
  legacyIdentityMap: LegacyTreatmentIdentityMapRecord;
}

export interface MigratedLegacyTreatmentResult extends MappedTreatmentDraft {
  reusedExisting: boolean;
}

export type PgTreatmentMigrationRunner = PgQueryExecutor &
  Pick<PgPoolManager, "withTransaction">;

const allowedTreatmentDiscountTypes = new Set([
  "None",
  "Senior Citizen",
  "PWD",
  "Senior Citizen/PWD",
  "Custom"
]);

const treatmentDiscountDefaults: Record<string, number> = {
  None: 0,
  "Senior Citizen": 20,
  PWD: 20,
  "Senior Citizen/PWD": 20,
  Custom: 0
};

function assertIsoDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    throw new Error(`${label} must use YYYY-MM-DD format.`);
  }

  return String(value);
}

function assertIsoTimestamp(value: string, label: string): string {
  const normalized = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(normalized)) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }

  if (Number.isNaN(Date.parse(normalized))) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }

  return normalized;
}

function assertTimeString(value: string, label: string): string {
  const normalized = String(value);
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(normalized)) {
    throw new Error(`${label} must use HH:MM 24-hour format.`);
  }

  return normalized;
}

function normalizeRequiredString(value: unknown, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeDiscountType(value: string | null): string {
  const normalized = normalizeOptionalString(value) ?? "None";
  if (!allowedTreatmentDiscountTypes.has(normalized)) {
    throw new Error(`Legacy treatment discount_type is invalid: ${normalized}.`);
  }

  return normalized;
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function parseNonnegativeMoney(value: LegacyMoneyValue, label: string): number | null {
  if (value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }

  return roundMoney(parsed);
}

function parseDiscountPercent(value: LegacyMoneyValue, discountType: string): number {
  if (value === null || value === "") {
    return roundMoney(treatmentDiscountDefaults[discountType] ?? 0);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error("Legacy treatment discount_percent must be between 0 and 100.");
  }

  if (discountType === "None") {
    return 0;
  }

  return roundMoney(parsed);
}

function parseRequiredMoney(value: LegacyMoneyValue, label: string): number {
  const parsed = parseNonnegativeMoney(value, label);
  if (parsed === null) {
    throw new Error(`${label} is required.`);
  }

  return parsed;
}

function resolveNextAppointmentDate(legacyTreatment: LegacyTreatmentRow): string | null {
  const resolvedValue = normalizeOptionalString(legacyTreatment.next_appointment_date)
    ?? normalizeOptionalString(legacyTreatment.next_appointment);

  if (!resolvedValue) {
    return null;
  }

  const nextAppointmentDate = assertIsoDate(resolvedValue, "Legacy treatment next appointment date");
  const treatmentDate = assertIsoDate(legacyTreatment.treatment_date, "Legacy treatment treatment_date");

  if (nextAppointmentDate < treatmentDate) {
    throw new Error("Legacy treatment next appointment date cannot be earlier than treatment_date.");
  }

  return nextAppointmentDate;
}

async function resolveMappedPatientContext(
  executor: PgQueryExecutor,
  legacyPatientCode: string
): Promise<{ patientId: string; branchId: string }> {
  const states = await listLegacyPatientMigrationStatesByCode(executor, "sqlite-v1", legacyPatientCode);

  if (states.length === 0) {
    throw new Error(`No migrated V2 patient mapping exists for legacy patient code ${legacyPatientCode}.`);
  }

  if (states.length > 1) {
    throw new Error(
      `Conflicting V2 patient mappings exist for legacy patient code ${legacyPatientCode}.`
    );
  }

  return {
    patientId: states[0].patient.id,
    branchId: states[0].patient.branchId
  };
}

export async function mapLegacyTreatmentToDraft(
  executor: PgQueryExecutor,
  legacyTreatment: LegacyTreatmentRow,
  treatmentId: string = crypto.randomUUID()
): Promise<MappedTreatmentDraft> {
  const treatmentCode = normalizeRequiredString(legacyTreatment.treatment_id, "Legacy treatment treatment_id");
  const patientCode = normalizeRequiredString(legacyTreatment.patient_id, "Legacy treatment patient_id");
  const { patientId, branchId } = await resolveMappedPatientContext(executor, patientCode);
  const treatmentDate = assertIsoDate(legacyTreatment.treatment_date, "Legacy treatment treatment_date");
  const nextAppointmentDate = resolveNextAppointmentDate(legacyTreatment);
  const nextAppointmentTime = normalizeOptionalString(legacyTreatment.next_appointment_time);
  const discountType = normalizeDiscountType(legacyTreatment.discount_type);
  const amountCharged = parseRequiredMoney(legacyTreatment.amount_charged, "Legacy treatment amount_charged");
  const amountPaid = parseRequiredMoney(legacyTreatment.amount_paid, "Legacy treatment amount_paid");
  const discountPercent = parseDiscountPercent(legacyTreatment.discount_percent, discountType);
  const discountAmount =
    parseNonnegativeMoney(legacyTreatment.discount_amount, "Legacy treatment discount_amount")
    ?? roundMoney((amountCharged * discountPercent) / 100);
  const netAmountDue =
    parseNonnegativeMoney(legacyTreatment.net_amount_due, "Legacy treatment net_amount_due")
    ?? roundMoney(amountCharged - discountAmount);
  const balance =
    parseNonnegativeMoney(legacyTreatment.balance, "Legacy treatment balance")
    ?? roundMoney(netAmountDue - amountPaid);

  if (amountPaid > netAmountDue) {
    throw new Error("Legacy treatment amount_paid cannot be greater than net_amount_due.");
  }

  if (nextAppointmentTime && !nextAppointmentDate) {
    throw new Error("Legacy treatment next_appointment_time requires a next appointment date.");
  }

  return {
    treatment: {
      id: treatmentId,
      treatmentCode,
      patientId,
      branchId,
      treatmentDate,
      toothNumbers: normalizeOptionalString(legacyTreatment.tooth_numbers),
      nextAppointmentDate,
      nextAppointmentTime: nextAppointmentTime ? assertTimeString(nextAppointmentTime, "Legacy treatment next_appointment_time") : null,
      procedure: normalizeRequiredString(legacyTreatment.procedure, "Legacy treatment procedure"),
      dentists: normalizeRequiredString(legacyTreatment.dentists, "Legacy treatment dentists"),
      amountCharged,
      discountType,
      discountPercent,
      discountAmount,
      netAmountDue,
      amountPaid,
      balance,
      remarks: normalizeOptionalString(legacyTreatment.remarks),
      createdAt: assertIsoTimestamp(legacyTreatment.created_at, "Legacy treatment created_at"),
      updatedAt: assertIsoTimestamp(legacyTreatment.updated_at, "Legacy treatment updated_at")
    },
    legacyIdentityMap: {
      sourceSystem: "sqlite-v1",
      legacyTreatmentRowId: legacyTreatment.id,
      legacyTreatmentCode: treatmentCode,
      treatmentId,
      createdAt: assertIsoTimestamp(legacyTreatment.created_at, "Legacy treatment created_at")
    }
  };
}

function findTreatmentDifference(existing: NewTreatmentRecord, expected: NewTreatmentRecord): string | null {
  for (const [key, expectedValue] of Object.entries(expected) as [
    keyof NewTreatmentRecord,
    NewTreatmentRecord[keyof NewTreatmentRecord]
  ][]) {
    if (existing[key] !== expectedValue) {
      return `${String(key)} expected ${JSON.stringify(expectedValue)} but found ${JSON.stringify(existing[key])}`;
    }
  }

  return null;
}

function buildPersistedMigrationResult(
  existingState: LegacyTreatmentMigrationState
): MigratedLegacyTreatmentResult {
  return {
    treatment: existingState.treatment,
    legacyIdentityMap: {
      sourceSystem: existingState.sourceSystem,
      legacyTreatmentRowId: existingState.legacyTreatmentRowId,
      legacyTreatmentCode: existingState.legacyTreatmentCode,
      treatmentId: existingState.treatment.id,
      createdAt: existingState.mappingCreatedAt
    },
    reusedExisting: true
  };
}

function assertMatchingExistingMigration(
  existingState: LegacyTreatmentMigrationState,
  expectedDraft: MappedTreatmentDraft
): void {
  if (existingState.legacyTreatmentRowId !== expectedDraft.legacyIdentityMap.legacyTreatmentRowId) {
    throw new Error("Existing legacy treatment mapping row id does not match the requested migration row id.");
  }

  if (existingState.legacyTreatmentCode !== expectedDraft.legacyIdentityMap.legacyTreatmentCode) {
    throw new Error("Existing legacy treatment mapping code does not match the requested migration treatment code.");
  }

  const difference = findTreatmentDifference(existingState.treatment, expectedDraft.treatment);
  if (difference) {
    throw new Error(`Existing migrated treatment does not match the expected Batch B parity state: ${difference}.`);
  }
}

export async function migrateLegacyTreatment(
  runner: PgTreatmentMigrationRunner,
  legacyTreatment: LegacyTreatmentRow
): Promise<MigratedLegacyTreatmentResult> {
  return runner.withTransaction(async (executor) => {
    const treatmentCode = normalizeRequiredString(legacyTreatment.treatment_id, "Legacy treatment treatment_id");
    const patientCode = normalizeRequiredString(legacyTreatment.patient_id, "Legacy treatment patient_id");
    await resolveMappedPatientContext(executor, patientCode);

    const existingStates = await listLegacyTreatmentMigrationStates(
      executor,
      "sqlite-v1",
      legacyTreatment.id,
      treatmentCode
    );

    if (existingStates.length > 1) {
      throw new Error(
        "Conflicting legacy treatment migration rows already exist for the same legacy identity keys."
      );
    }

    const existingState = existingStates[0];
    if (existingState) {
      const expectedDraft = await mapLegacyTreatmentToDraft(executor, legacyTreatment, existingState.treatment.id);
      assertMatchingExistingMigration(existingState, expectedDraft);
      return buildPersistedMigrationResult(existingState);
    }

    const conflictingTreatment = await getTreatmentByCode(executor, treatmentCode);
    if (conflictingTreatment) {
      throw new Error(
        `Treatment code conflict: ${treatmentCode} already exists without a matching legacy identity mapping.`
      );
    }

    const mappedDraft = await mapLegacyTreatmentToDraft(executor, legacyTreatment);
    const insertedTreatment = await insertTreatment(executor, mappedDraft.treatment);
    await insertLegacyTreatmentIdentityMap(executor, mappedDraft.legacyIdentityMap);

    return {
      treatment: insertedTreatment,
      legacyIdentityMap: mappedDraft.legacyIdentityMap,
      reusedExisting: false
    };
  });
}
