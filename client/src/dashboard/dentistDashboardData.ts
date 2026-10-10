import type { SchedulingBranch } from "../appointments/appointmentApi.js";

export interface DentistDashboardAccess {
  selfUserId: string;
  branchIds: string[];
  patientLookup: boolean;
  requestReview: boolean;
  treatmentPublish: boolean;
  documentVisibility: boolean;
}

export interface SafeAppointmentSlot {
  time: string;
  status: "confirmed" | "checked_in";
}

export interface DentistDaySummary {
  confirmed: number;
  checkedIn: number;
  inProgress: number;
  completed: number;
  pendingConfirmation: number;
  nextSlot: SafeAppointmentSlot | null;
  upcomingSlots: SafeAppointmentSlot[];
}

export interface DentistSummaryEnvelope {
  branchId: string;
  date: string;
  selfUserId: string;
  summary: DentistDaySummary;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const allowedStatuses = new Set([
  "requested", "pending_confirmation", "confirmed", "checked_in", "in_progress",
  "completed", "cancelled_by_patient", "cancelled_by_clinic", "no_show", "rescheduled"
]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requireValidDate(date: string): string {
  if (!isoDate.test(date) || Number.isNaN(Date.parse(date + "T00:00:00Z")) ||
      new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date) {
    throw new Error("Invalid clinic appointment date.");
  }
  return date;
}

export function clinicLocalClock(at: Date = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(at);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  const year = value("year"), month = value("month"), day = value("day");
  const hour = value("hour"), minute = value("minute");
  if (!year || !month || !day || !hour || !minute) throw new Error("Clinic time is unavailable.");
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}

export function parseDentistAccess(value: unknown): DentistDashboardAccess {
  const data = record(value), roles = data?.roles, branches = data?.branchIds;
  const capabilities = record(data?.dentist), links = data?.links;
  if (!data || !Array.isArray(roles) || !roles.every((role) => typeof role === "string") ||
      !roles.includes("DENTIST") || roles.includes("SYSTEM_ADMINISTRATOR") ||
      !Array.isArray(branches) || !branches.every((id) => typeof id === "string" && uuid.test(id)) ||
      branches.length === 0 || !Array.isArray(links) ||
      !links.some((link: unknown) => {
        const item = record(link);
        return item?.key === "dentist-dashboard" && item.path === "/dentist-dashboard";
      }) || !capabilities || typeof capabilities.userId !== "string" || !uuid.test(capabilities.userId)) {
    throw new Error("Dentist dashboard authorization is unavailable.");
  }
  const fields = ["patientLookup", "requestReview", "treatmentPublish", "documentVisibility"] as const;
  if (!fields.every((field) => typeof capabilities[field] === "boolean")) {
    throw new Error("Dentist permissions are unavailable.");
  }
  return {
    selfUserId: capabilities.userId,
    branchIds: [...new Set(branches as string[])],
    patientLookup: capabilities.patientLookup === true,
    requestReview: capabilities.requestReview === true,
    treatmentPublish: capabilities.treatmentPublish === true,
    documentVisibility: capabilities.documentVisibility === true
  };
}

export function permittedDentistBranches(raw: unknown, access: DentistDashboardAccess): SchedulingBranch[] {
  const context = record(raw), items = context?.branches;
  if (!Array.isArray(items)) throw new Error("Scheduling branch data is unavailable.");
  const allowed = new Set(access.branchIds);
  const seen = new Set<string>();
  const result: SchedulingBranch[] = [];
  for (const item of items) {
    const branch = record(item);
    if (!branch || typeof branch.id !== "string" || !uuid.test(branch.id) ||
        typeof branch.branchCode !== "string" || !branch.branchCode.trim() ||
        typeof branch.branchName !== "string" || !branch.branchName.trim()) {
      throw new Error("Invalid scheduling branch.");
    }
    if (allowed.has(branch.id) && !seen.has(branch.id)) {
      result.push({ id: branch.id, branchCode: branch.branchCode, branchName: branch.branchName });
      seen.add(branch.id);
    }
  }
  return result;
}

export function dentistAppointmentListPath(branchId: string, date: string, selfUserId: string): string {
  if (!uuid.test(branchId) || !uuid.test(selfUserId)) throw new Error("Invalid appointment identity.");
  requireValidDate(date);
  const query = new URLSearchParams({ branchId, date, dentistUserId: selfUserId });
  return `/appointments?${query.toString()}`;
}

export function summarizeDentistDay(
  raw: unknown,
  branchId: string,
  day: string,
  selfUserId: string,
  now: Date = new Date()
): DentistDaySummary {
  dentistAppointmentListPath(branchId, day, selfUserId);
  if (!Array.isArray(raw) || raw.length > 500) throw new Error("Dentist schedule data is unavailable.");
  const today = clinicLocalClock(now);
  const seen = new Set<string>();
  const summary: DentistDaySummary = {
    confirmed: 0, checkedIn: 0, inProgress: 0, completed: 0,
    pendingConfirmation: 0, nextSlot: null, upcomingSlots: []
  };
  const upcoming: SafeAppointmentSlot[] = [];
  for (const value of raw) {
    const item = record(value);
    if (!item || typeof item.id !== "string" || !uuid.test(item.id) ||
        item.branchId !== branchId || item.dentistUserId !== selfUserId ||
        item.appointmentDate !== day || typeof item.status !== "string" ||
        !allowedStatuses.has(item.status) || seen.has(item.id)) {
      throw new Error("Dentist schedule data did not match the verified filter.");
    }
    seen.add(item.id);
    if (item.status === "confirmed") summary.confirmed++;
    if (item.status === "checked_in") summary.checkedIn++;
    if (item.status === "in_progress") summary.inProgress++;
    if (item.status === "completed") summary.completed++;
    if (item.status === "requested" || item.status === "pending_confirmation") summary.pendingConfirmation++;
    if (item.appointmentTime !== null && typeof item.appointmentTime !== "string") {
      throw new Error("Invalid appointment time.");
    }
    if (item.appointmentTime !== null && !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/.test(item.appointmentTime as string)) {
      throw new Error("Invalid appointment time.");
    }
    if ((item.status === "confirmed" || item.status === "checked_in") &&
        typeof item.appointmentTime === "string" &&
        (day > today.date || (day === today.date && item.appointmentTime.slice(0, 5) >= today.time))) {
      upcoming.push({ time: item.appointmentTime.slice(0, 5), status: item.status });
    }
  }
  upcoming.sort((left, right) => left.time.localeCompare(right.time));
  summary.nextSlot = upcoming[0] ?? null;
  summary.upcomingSlots = upcoming.slice(0, 5);
  return summary;
}

export function visibleDentistSummary(
  envelope: DentistSummaryEnvelope | null,
  branchId: string,
  date: string,
  selfUserId: string,
  allowed: boolean
): DentistDaySummary | null {
  return allowed && envelope?.branchId === branchId && envelope.date === date &&
    envelope.selfUserId === selfUserId
    ? envelope.summary
    : null;
}
