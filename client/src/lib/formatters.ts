const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

type DisplayValue = string | number | boolean | null | undefined;

export function formatPesoAmount(value: DisplayValue): string {
  if (value === null || value === undefined || value === "") {
    return "₱0.00";
  }

  const numericValue = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numericValue)) {
    return "₱0.00";
  }

  return pesoFormatter.format(numericValue);
}

export function displayNone<T extends DisplayValue>(value: T): T | "None" {
  return value && String(value).trim() ? value : "None";
}

export function isPwdRelatedClassification(value: DisplayValue): boolean {
  const normalized = String(value || "").trim();
  return normalized === "PWD" || normalized === "Senior Citizen and PWD";
}

export function shouldShowPatientClassificationInSummary(value: DisplayValue): boolean {
  const normalized = String(value || "").trim();
  return normalized === "Senior Citizen" || normalized === "PWD" || normalized === "Senior Citizen and PWD";
}

function parsePlainDate(value: DisplayValue): Date | null {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;

  return new Date(year, month - 1, day);
}

export function displayNoFinalTime(value: DisplayValue): string {
  return value && String(value).trim() ? formatTimeValue(value) : "No final time";
}

export function displayPlannedProcedure<T extends DisplayValue>(value: T): T | "General Appointment" {
  return value && String(value).trim() ? value : "General Appointment";
}

export function formatTimeValue(value: DisplayValue): string {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  const match = normalized.match(/^(\d{2}):(\d{2})$/);
  if (!match) return normalized;

  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes} ${suffix}`;
}

export function formatReadableDate(value: DisplayValue): DisplayValue | "" {
  if (!value) return "";
  const date = parsePlainDate(value);
  if (!date || Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}
