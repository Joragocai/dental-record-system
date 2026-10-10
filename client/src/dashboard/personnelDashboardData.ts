import type { AppointmentRecord, SchedulingBranch } from "../appointments/appointmentApi.js";

export interface PersonnelAccess {
  branchIds: string[];
  patientLookup: boolean;
  requestReview: boolean;
  dailyFinanceRead: boolean;
  receivablesRead: boolean;
  expenseCreate: boolean;
}
export interface PendingCount { count: number; limitReached: boolean }
export interface AppointmentCounts { confirmed: number; checkedIn: number; unconfirmed: number }
export interface PersonnelFinance {
  cashCollected: string;
  digitalCollected: string;
  outstandingReceivables: string;
}
export interface PersonnelSnapshot {
  appointments: AppointmentCounts | null;
  pending: PendingCount | null;
  finance: PersonnelFinance | null;
}
export interface PersonnelSnapshotEnvelope {
  branchId: string;
  date: string;
  data: PersonnelSnapshot;
}
export function visiblePersonnelSnapshot(
  snapshot: PersonnelSnapshotEnvelope | null,
  branchId: string,
  date: string,
  authorized: boolean
): PersonnelSnapshot | null {
  return authorized && snapshot?.branchId === branchId && snapshot.date === date
    ? snapshot.data
    : null;
}

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const money = /^\d+\.\d{2}$/;
const statuses = new Set([
  "requested", "pending_confirmation", "confirmed", "checked_in", "in_progress", "completed",
  "cancelled_by_patient", "cancelled_by_clinic", "no_show", "rescheduled"
]);
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
export function clinicBusinessDate(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  const year = get("year"), month = get("month"), day = get("day");
  if (!year || !month || !day) throw new Error("Clinic date is unavailable.");
  return `${year}-${month}-${day}`;
}
export function parsePersonnelAccess(raw: unknown): PersonnelAccess {
  const result = object(raw), roles = result?.roles, ids = result?.branchIds, links = result?.links;
  const permissions = object(result?.personnel);
  if (!result || !Array.isArray(roles) || !roles.includes("PERSONNEL") ||
      roles.includes("SYSTEM_ADMINISTRATOR") || !Array.isArray(ids) ||
      !ids.every((id) => typeof id === "string" && uuid.test(id)) ||
      !Array.isArray(links) || !links.some((link: unknown) => {
        const item = object(link);
        return item?.key === "personnel-dashboard" && item.path === "/personnel-dashboard";
      }) || !permissions) throw new Error("Personnel dashboard authorization is unavailable.");
  const names = ["patientLookup", "requestReview", "dailyFinanceRead", "receivablesRead", "expenseCreate"] as const;
  if (!names.every((key) => typeof permissions[key] === "boolean")) throw new Error("Invalid dashboard capabilities.");
  const branchIds = [...new Set(ids as string[])];
  const grants = Object.fromEntries(names.map((key) => [key, branchIds.length > 0 && permissions[key] === true])) as
    Pick<PersonnelAccess, typeof names[number]>;
  return { branchIds, ...grants };
}
export function assignedSchedulingBranches(raw: unknown, access: PersonnelAccess): SchedulingBranch[] {
  const payload = object(raw), branches = payload?.branches;
  if (!Array.isArray(branches)) throw new Error("Scheduling branches are unavailable.");
  const allowed = new Set(access.branchIds);
  const filtered: SchedulingBranch[] = [];
  const seen = new Set<string>();
  for (const branch of branches) {
    const row = object(branch);
    if (!row || typeof row.id !== "string" || !uuid.test(row.id) ||
        typeof row.branchName !== "string" || !row.branchName.trim() ||
        typeof row.branchCode !== "string") throw new Error("Invalid scheduling branch.");
    if (allowed.has(row.id) && !seen.has(row.id)) {
      filtered.push({ id: row.id, branchName: row.branchName, branchCode: row.branchCode });
      seen.add(row.id);
    }
  }
  return filtered;
}
export function summarizeAppointments(raw: unknown, branchId: string, date: string): AppointmentCounts {
  if (!Array.isArray(raw) || !uuid.test(branchId) || !dateOnly.test(date))
    throw new Error("Invalid appointment summary.");
  const seen = new Set<string>();
  const counts = { confirmed: 0, checkedIn: 0, unconfirmed: 0 };
  for (const appointment of raw) {
    const item = object(appointment);
    if (!item || typeof item.id !== "string" || !uuid.test(item.id) || seen.has(item.id) ||
        item.branchId !== branchId || item.appointmentDate !== date ||
        typeof item.status !== "string" || !statuses.has(item.status))
      throw new Error("Appointments do not match the authorized branch and date.");
    seen.add(item.id);
    if (item.status === "confirmed") counts.confirmed++;
    if (item.status === "checked_in") counts.checkedIn++;
    if (item.status === "requested" || item.status === "pending_confirmation") counts.unconfirmed++;
  }
  return counts;
}
export function pendingRequestCount(raw: unknown): PendingCount {
  if (!Array.isArray(raw) || raw.length > 100 ||
      !raw.every((item: unknown) => {
        const row = object(item);
        return row && typeof row.id === "string" && uuid.test(row.id) &&
          (row.request_type === "cancel" || row.request_type === "reschedule");
      })) throw new Error("Pending-request response is invalid.");
  return { count: raw.length, limitReached: raw.length === 100 };
}
export function parsePersonnelFinance(raw: unknown, branchId: string, date: string): PersonnelFinance {
  const row = object(raw);
  if (!row || row.branchId !== branchId || row.businessDate !== date ||
      row.internalOnly !== true || row.expensesPaidStatus !== "not_integrated" ||
      !["cashCollected", "digitalCollected", "outstandingReceivables"].every(
        (key) => typeof row[key] === "string" && money.test(row[key])
      )) throw new Error("The internal finance summary could not be verified.");
  return {
    cashCollected: row.cashCollected as string,
    digitalCollected: row.digitalCollected as string,
    outstandingReceivables: row.outstandingReceivables as string
  };
}
export function createLatestRequestGuard() {
  let generation = 0;
  return {
    begin() { const id = ++generation; return () => generation === id; },
    cancel() { ++generation; }
  };
}
export const expenseCategories = [
  ["DENTAL_SUPPLIES", "Dental supplies"], ["CLEANING_SUPPLIES", "Cleaning supplies"],
  ["OFFICE_SUPPLIES", "Office supplies"], ["UTILITIES", "Utilities"],
  ["RENT", "Rent"], ["LABORATORY_FEES", "Laboratory fees"], ["EQUIPMENT", "Equipment"],
  ["MAINTENANCE", "Maintenance"], ["TRANSPORTATION", "Transportation"],
  ["STAFF_EXPENSE", "Staff expense"], ["MISCELLANEOUS", "Miscellaneous"]
] as const;
export interface ExpenseDraft { categoryCode: string; description: string; amount: string }
export function validateExpenseDraft(draft: ExpenseDraft): boolean {
  return expenseCategories.some(([key]) => key === draft.categoryCode) &&
    draft.description.trim().length >= 5 && draft.description.trim().length <= 500 &&
    /^\d{1,10}(\.\d{1,2})?$/.test(draft.amount.trim()) &&
    !/^0+(\.0{1,2})?$/.test(draft.amount.trim());
}
