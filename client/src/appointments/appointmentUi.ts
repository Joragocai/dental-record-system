import type { AppointmentRecord, AppointmentStatus } from "./appointmentApi.js";

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  requested: "Requested",
  pending_confirmation: "Pending confirmation",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  in_progress: "In progress",
  completed: "Completed",
  cancelled_by_patient: "Cancelled by patient",
  cancelled_by_clinic: "Cancelled by clinic",
  no_show: "No-show",
  rescheduled: "Rescheduled"
};

export const appointmentStatusOptions: Array<{ value: AppointmentStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  ...Object.entries(appointmentStatusLabels).map(([value, label]) => ({
    value: value as AppointmentStatus,
    label
  }))
];

export function manilaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const record = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${record.year}-${record.month}-${record.day}`;
}

export function addDays(date: string, amount: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

export function startOfWeek(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  const day = parsed.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(date, offset);
}

export function weekDates(date: string): string[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function formatCalendarDate(date: string, style: "short" | "long" = "long"): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    weekday: style === "long" ? "long" : "short",
    month: style === "long" ? "long" : "short",
    day: "numeric",
    year: style === "long" ? "numeric" : undefined
  }).format(parsed);
}

export function formatAppointmentTime(time: string | null): string {
  if (!time) return "Time pending";
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return time;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function appointmentEndTime(time: string | null, durationMinutes: number | null): string | null {
  if (!time || !durationMinutes) return null;
  const [hourText, minuteText] = time.split(":");
  const start = Number(hourText) * 60 + Number(minuteText);
  if (!Number.isFinite(start)) return null;
  const end = start + durationMinutes;
  if (end >= 24 * 60) return null;
  const hour = Math.floor(end / 60);
  const minute = end % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function sortAppointments(records: AppointmentRecord[]): AppointmentRecord[] {
  return [...records].sort((left, right) => {
    const date = left.appointmentDate.localeCompare(right.appointmentDate);
    if (date !== 0) return date;
    const leftTime = left.appointmentTime ?? "00:00";
    const rightTime = right.appointmentTime ?? "00:00";
    const time = leftTime.localeCompare(rightTime);
    return time !== 0 ? time : left.id.localeCompare(right.id);
  });
}

export function isPendingAppointment(record: AppointmentRecord): boolean {
  return record.status === "requested" || record.status === "pending_confirmation";
}

export function isTerminalAppointment(record: AppointmentRecord): boolean {
  return ["completed", "cancelled_by_patient", "cancelled_by_clinic", "no_show", "rescheduled"].includes(record.status);
}

export function statusBadgeClass(status: AppointmentStatus): string {
  switch (status) {
    case "requested":
    case "pending_confirmation":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "confirmed":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "checked_in":
    case "in_progress":
      return "border-indigo-200 bg-indigo-50 text-indigo-800";
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "cancelled_by_patient":
    case "cancelled_by_clinic":
    case "no_show":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "rescheduled":
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}
