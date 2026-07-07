const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export function formatPesoAmount(value) {
  if (value === null || value === undefined || value === "") {
    return "₱0.00";
  }

  const numericValue = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numericValue)) {
    return "₱0.00";
  }

  return pesoFormatter.format(numericValue);
}

export function displayNone(value) {
  return value && String(value).trim() ? value : "None";
}

export function isPwdRelatedClassification(value) {
  const normalized = String(value || "").trim();
  return normalized === "PWD" || normalized === "Senior Citizen and PWD";
}

export function shouldShowPatientClassificationInSummary(value) {
  const normalized = String(value || "").trim();
  return normalized === "Senior Citizen" || normalized === "PWD" || normalized === "Senior Citizen and PWD";
}

export function displayNoFinalTime(value) {
  return value && String(value).trim() ? formatTimeValue(value) : "No final time";
}

export function displayPlannedProcedure(value) {
  return value && String(value).trim() ? value : "General Appointment";
}

export function formatTimeValue(value) {
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

export function formatReadableDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}
