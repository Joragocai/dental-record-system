// PostgreSQL DATE values need stable YYYY-MM-DD strings in the React API.
// pg returns TIMESTAMPTZ as Date and NUMERIC values as strings by default.
export function pgDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const date = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid PostgreSQL DATE value.");
  return date;
}

export function pgTimestamp(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error("Invalid PostgreSQL timestamp.");
  return date.toISOString();
}

export function fromPgMoneyCents(value) {
  const string = String(value);
  const match = /^(0|[1-9]\d{0,11})(?:\.(\d{1,2}))?$/.exec(string);
  if (!match) throw new Error("Invalid monetary amount from PostgreSQL.");
  const cents = Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("Monetary amount exceeds safe range.");
  return cents;
}

export function fromPgCents(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error("PostgreSQL centavos value exceeds safe range.");
  return number;
}

export function asPgMoney(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("Invalid centavos value.");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function normalizePgRow(row) {
  if (!row) return null;
  const next = { ...row };
  for (const field of ["date_registered", "birthday", "insurance_effective_date", "last_dental_visit",
    "treatment_date", "next_appointment_date", "appointment_date", "payment_date"]) {
    if (next[field] != null && next[field] !== "") next[field] = pgDate(next[field]);
  }
  for (const field of ["created_at", "updated_at", "uploaded_at"]) {
    if (next[field] != null) next[field] = pgTimestamp(next[field]);
  }
  for (const field of ["amount_charged", "discount_amount", "discount_percent", "net_amount_due", "amount_paid", "balance"]) {
    if (next[field] != null) {
      const value = Number(next[field]);
      if (!Number.isFinite(value)) throw new Error(`Invalid numeric field: ${field}`);
      next[field] = value;
    }
  }
  if (next.attachment_count !== undefined) next.attachment_count = Number(next.attachment_count);
  return next;
}
