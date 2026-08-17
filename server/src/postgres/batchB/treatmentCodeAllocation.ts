import type { QueryResultRow } from "pg";
import type { PgQueryExecutor } from "../pool.js";
import { defaultClinicTimezone } from "../batchA/patientCodeAllocation.js";

export interface AllocateTreatmentCodeResult {
  calendarYear: number;
  sequence: number;
  treatmentCode: string;
}

interface TreatmentCodeCounterRow extends QueryResultRow {
  last_sequence: number | string;
}

function getYearInTimeZone(allocationDate: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric"
  });
  const yearPart = formatter.formatToParts(allocationDate).find((part) => part.type === "year")?.value;
  const year = Number(yearPart);

  if (!Number.isInteger(year)) {
    throw new Error(`Treatment code allocation year is invalid for timezone ${timeZone}.`);
  }

  return year;
}

export function getTreatmentCodeCalendarYear(
  allocationDate: Date,
  timeZone = process.env.CLINIC_TIMEZONE || defaultClinicTimezone
): number {
  const year = getYearInTimeZone(allocationDate, timeZone);

  if (!Number.isInteger(year) || year < 2000) {
    throw new Error(`Treatment code allocation year is invalid: ${year}.`);
  }

  return year;
}

export function formatTreatmentCode(calendarYear: number, sequence: number): string {
  if (!Number.isInteger(calendarYear) || calendarYear < 2000) {
    throw new Error(`Treatment code year must be a valid calendar year: ${calendarYear}.`);
  }

  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Treatment code sequence must be a positive integer: ${sequence}.`);
  }

  return `T-${calendarYear}-${String(sequence).padStart(4, "0")}`;
}

export async function allocateAnnualTreatmentCode(
  executor: PgQueryExecutor,
  allocationDate = new Date(),
  timeZone = process.env.CLINIC_TIMEZONE || defaultClinicTimezone
): Promise<AllocateTreatmentCodeResult> {
  const calendarYear = getTreatmentCodeCalendarYear(allocationDate, timeZone);
  const updatedAt = allocationDate.toISOString();
  const result = await executor.query<TreatmentCodeCounterRow>(
    `INSERT INTO treatment_code_counters (calendar_year, last_sequence, updated_at)
     VALUES ($1, 1, $2)
     ON CONFLICT (calendar_year) DO UPDATE
     SET last_sequence = treatment_code_counters.last_sequence + 1,
         updated_at = EXCLUDED.updated_at
     RETURNING last_sequence`,
    [calendarYear, updatedAt]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Treatment code allocation did not return a sequence.");
  }

  const sequence = Number(row.last_sequence);
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Treatment code allocation returned an invalid sequence: ${String(row.last_sequence)}.`);
  }

  return {
    calendarYear,
    sequence,
    treatmentCode: formatTreatmentCode(calendarYear, sequence)
  };
}
