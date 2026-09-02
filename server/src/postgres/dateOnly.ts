export type PgDateOnlyValue = string | Date;

function padTwoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

export function normalizePgDateOnly(value: PgDateOnlyValue, label: string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`${label} must be a valid PostgreSQL DATE value.`);
    }

    // node-postgres can decode DATE as a local-midnight Date. Use local calendar
    // parts so positive UTC offsets do not shift a plain clinic date backward.
    return `${value.getFullYear()}-${padTwoDigits(value.getMonth() + 1)}-${padTwoDigits(value.getDate())}`;
  }

  const normalized = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${label} must use YYYY-MM-DD format.`);
  }

  return normalized;
}

export function normalizeNullablePgDateOnly(value: PgDateOnlyValue | null, label: string): string | null {
  return value === null ? null : normalizePgDateOnly(value, label);
}
