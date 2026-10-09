import type { AppointmentStatus } from "../postgres/batchC/appointments.js";
import { AppointmentDomainError } from "./appointmentDomainErrors.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const clinicTimeZone = "Asia/Manila";
export const slotReservingStatuses = new Set<AppointmentStatus>(["confirmed", "checked_in", "in_progress"]);

export interface NormalizedSchedule {
  appointmentDate: string;
  appointmentTime: string | null;
  durationMinutes: number | null;
  dentistUserId: string | null;
}

export function requireAppointmentUuid(value: unknown): string {
  if (typeof value !== "string") throw new AppointmentDomainError("APPOINTMENT_INPUT_INVALID");
  const normalized = value.trim().toLowerCase();
  if (!uuidPattern.test(normalized)) throw new AppointmentDomainError("APPOINTMENT_INPUT_INVALID");
  return normalized;
}

export function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new AppointmentDomainError("APPOINTMENT_INPUT_INVALID");
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  if (normalized.length > maxLength) throw new AppointmentDomainError("APPOINTMENT_INPUT_INVALID");
  return normalized;
}

export function normalizeDate(value: unknown): string {
  if (typeof value !== "string" || !datePattern.test(value.trim())) {
    throw new AppointmentDomainError("APPOINTMENT_INPUT_INVALID");
  }
  const normalized = value.trim();
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new AppointmentDomainError("APPOINTMENT_INPUT_INVALID");
  }
  return normalized;
}

export function normalizeTime(value: unknown, allowNull = true): string | null {
  if ((value === undefined || value === null || value === "") && allowNull) return null;
  if (typeof value !== "string") throw new AppointmentDomainError("APPOINTMENT_INPUT_INVALID");
  const normalized = value.trim();
  if (!timePattern.test(normalized)) throw new AppointmentDomainError("APPOINTMENT_INPUT_INVALID");
  return normalized;
}

export function normalizeDuration(value: unknown, allowNull = true): number | null {
  if ((value === undefined || value === null || value === "") && allowNull) return null;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 1440) {
    throw new AppointmentDomainError("APPOINTMENT_INPUT_INVALID");
  }
  return Number(value);
}

export function normalizeDentistId(value: unknown, allowNull = true): string | null {
  if ((value === undefined || value === null || value === "") && allowNull) return null;
  return requireAppointmentUuid(value);
}

export function getManilaLocalParts(now: Date): { date: string; time: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: clinicTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
  };
}

export function assertNotPastSchedule(date: string, time: string | null, now: Date): void {
  if (!time) return;
  const local = getManilaLocalParts(now);
  if (date < local.date || (date === local.date && time < local.time)) {
    throw new AppointmentDomainError("APPOINTMENT_INPUT_INVALID", ["Appointment schedule cannot be in the past."]);
  }
}

export function assertSlotShape(schedule: NormalizedSchedule): void {
  if (!schedule.appointmentTime || !schedule.durationMinutes || !schedule.dentistUserId) {
    throw new AppointmentDomainError("APPOINTMENT_INPUT_INVALID", [
      "Slot-reserving appointments require time, duration, and Dentist."
    ]);
  }
  const match = timePattern.exec(schedule.appointmentTime);
  if (!match) throw new AppointmentDomainError("APPOINTMENT_INPUT_INVALID");
  const startMinutes = Number(match[1]) * 60 + Number(match[2]);
  if (startMinutes + schedule.durationMinutes > 1440) {
    throw new AppointmentDomainError("APPOINTMENT_INPUT_INVALID", [
      "Appointment duration must not cross the clinic calendar date boundary."
    ]);
  }
}

export function normalizeReason(value: unknown): string | null {
  return normalizeOptionalText(value, 500);
}

export function normalizeSearchQuery(value: unknown): string {
  if (typeof value !== "string") throw new AppointmentDomainError("APPOINTMENT_INPUT_INVALID");
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 2 || normalized.length > 100) {
    throw new AppointmentDomainError("APPOINTMENT_INPUT_INVALID");
  }
  return normalized;
}
