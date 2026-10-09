import { authenticatedV2Fetch, type AuthenticatedFetchOptions } from "../auth/authApi.js";

export type AppointmentStatus =
  | "requested"
  | "pending_confirmation"
  | "confirmed"
  | "checked_in"
  | "in_progress"
  | "completed"
  | "cancelled_by_patient"
  | "cancelled_by_clinic"
  | "no_show"
  | "rescheduled";

export interface AppointmentRecord {
  id: string;
  patientId: string;
  patientCode?: string | null;
  patientDisplayName?: string | null;
  patientMobileNumber?: string | null;
  branchId: string;
  dentistUserId: string | null;
  appointmentDate: string;
  appointmentTime: string | null;
  durationMinutes: number | null;
  plannedProcedure: string | null;
  notes: string | null;
  status: AppointmentStatus;
  rescheduledFromAppointmentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulingBranch {
  id: string;
  branchCode: string;
  branchName: string;
}

export interface SchedulingDentist {
  id: string;
  displayName: string;
}

export interface AppointmentUiCapabilities {
  create: boolean;
  update: boolean;
  confirm: boolean;
  reschedule: boolean;
  cancel: boolean;
  checkIn: boolean;
  start: boolean;
  complete: boolean;
  noShow: boolean;
}

export interface SchedulingBootstrap {
  branches: SchedulingBranch[];
  capabilities: AppointmentUiCapabilities;
}

export interface SchedulingContext {
  branch: SchedulingBranch;
  dentists: SchedulingDentist[];
  capabilities: AppointmentUiCapabilities;
}

export interface MinimalAppointmentPatient {
  id: string;
  patientCode: string;
  displayName: string;
  mobileNumber: string;
}

export interface AppointmentApiError extends Error {
  status: number;
}

function createApiError(status: number, message: string): AppointmentApiError {
  const error = new Error(message) as AppointmentApiError;
  error.name = "AppointmentApiError";
  error.status = status;
  return error;
}

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    let message = fallbackMessage;
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === "string" && payload.message.trim()) message = payload.message.trim();
    } catch {
      // Keep the safe fallback.
    }
    throw createApiError(response.status, message);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw createApiError(502, "The appointment service returned an invalid response.");
  }
}

function queryString(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

async function requestJson<T>(
  path: string,
  init: RequestInit,
  options: AuthenticatedFetchOptions,
  fallbackMessage: string
): Promise<T> {
  const response = await authenticatedV2Fetch(path, init, options);
  return readJson<T>(response, fallbackMessage);
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  };
}

export function getSchedulingBootstrap(options: AuthenticatedFetchOptions): Promise<SchedulingBootstrap> {
  return requestJson(
    "/appointments/scheduling-context",
    { method: "GET" },
    options,
    "Unable to load appointment branches."
  );
}

export function getSchedulingContext(
  branchId: string,
  options: AuthenticatedFetchOptions
): Promise<SchedulingContext> {
  return requestJson(
    `/appointments/scheduling-context${queryString({ branchId })}`,
    { method: "GET" },
    options,
    "Unable to load the scheduling context."
  );
}

export function listCalendarAppointments(
  input: { branchId: string; date: string },
  options: AuthenticatedFetchOptions
): Promise<AppointmentRecord[]> {
  return requestJson(
    `/calendar${queryString(input)}`,
    { method: "GET" },
    options,
    "Unable to load appointments."
  );
}

export function searchSchedulingPatients(
  branchId: string,
  query: string,
  options: AuthenticatedFetchOptions
): Promise<MinimalAppointmentPatient[]> {
  return requestJson(
    `/appointments/patient-search${queryString({ branchId, q: query })}`,
    { method: "GET" },
    options,
    "Unable to search patients."
  );
}

export function checkAppointmentAvailability(
  input: {
    branchId: string;
    dentistUserId: string;
    date: string;
    time: string;
    durationMinutes: number;
    excludeAppointmentId?: string | null;
  },
  options: AuthenticatedFetchOptions
): Promise<{ available: boolean }> {
  return requestJson(
    `/appointments/availability${queryString(input)}`,
    { method: "GET" },
    options,
    "Unable to check Dentist availability."
  );
}

export function createAppointment(
  input: Record<string, unknown>,
  options: AuthenticatedFetchOptions
): Promise<AppointmentRecord> {
  return requestJson(
    "/appointments",
    jsonInit("POST", input),
    options,
    "Unable to create the appointment."
  );
}

export function updateAppointment(
  appointmentId: string,
  input: Record<string, unknown>,
  options: AuthenticatedFetchOptions
): Promise<AppointmentRecord> {
  return requestJson(
    `/appointments/${appointmentId}`,
    jsonInit("PATCH", input),
    options,
    "Unable to update the appointment."
  );
}

export function confirmAppointment(
  appointmentId: string,
  input: Record<string, unknown>,
  options: AuthenticatedFetchOptions
): Promise<AppointmentRecord> {
  return requestJson(
    `/appointments/${appointmentId}/confirm`,
    jsonInit("POST", input),
    options,
    "Unable to confirm the appointment."
  );
}

export function rescheduleAppointment(
  appointmentId: string,
  input: Record<string, unknown>,
  options: AuthenticatedFetchOptions
): Promise<AppointmentRecord> {
  return requestJson(
    `/appointments/${appointmentId}/reschedule`,
    jsonInit("POST", input),
    options,
    "Unable to reschedule the appointment."
  );
}

export function cancelAppointment(
  appointmentId: string,
  reason: string,
  options: AuthenticatedFetchOptions
): Promise<AppointmentRecord> {
  return requestJson(
    `/appointments/${appointmentId}/cancel`,
    jsonInit("POST", { reason: reason || null }),
    options,
    "Unable to cancel the appointment."
  );
}

export function runAppointmentAction(
  appointmentId: string,
  action: "check-in" | "start" | "complete" | "no-show",
  options: AuthenticatedFetchOptions
): Promise<AppointmentRecord> {
  return requestJson(
    `/appointments/${appointmentId}/${action}`,
    jsonInit("POST"),
    options,
    "Unable to update the appointment."
  );
}
