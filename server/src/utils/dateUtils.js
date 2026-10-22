export const manilaTimeZone = "Asia/Manila";

// Clinic dates follow the Philippine calendar regardless of the server timezone.
export function getManilaTodayIso(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: manilaTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(now);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function toIsoDateString(date = new Date()) {
  return getManilaTodayIso(date);
}

export function timestampForFile(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}_${hours}${minutes}`;
}
