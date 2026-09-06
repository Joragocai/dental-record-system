import type { VerifiedBackendIdentity } from "./authTypes.js";

export interface AuthenticatedFetchOptions {
  accessToken: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface SessionResponse {
  authenticated?: unknown;
  user?: {
    id?: unknown;
    email?: unknown;
  };
}

function normalizeApiBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function authenticatedV2Fetch(
  path: string,
  init: RequestInit = {},
  options: AuthenticatedFetchOptions
): Promise<Response> {
  const apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl ?? "http://127.0.0.1:3002/api");
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${options.accessToken}`);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  return fetchImpl(`${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers
  });
}

export async function activateBackendStaffAccount(options: AuthenticatedFetchOptions): Promise<void> {
  const response = await authenticatedV2Fetch("/staff-accounts/activate", { method: "POST" }, options);
  if (response.status === 401) {
    throw new Error("Your invitation session is no longer valid. Please open a fresh invitation link.");
  }
  if (!response.ok) {
    let message = "Unable to activate the staff account right now.";
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === "string" && payload.message.trim()) message = payload.message;
    } catch {
      // Keep the safe generic message.
    }
    throw new Error(message);
  }
}

export async function verifyBackendSession(options: AuthenticatedFetchOptions): Promise<VerifiedBackendIdentity> {
  const response = await authenticatedV2Fetch("/auth/session", { method: "GET" }, options);

  if (response.status === 401) {
    throw new Error("Your session is no longer valid. Please sign in again.");
  }
  if (!response.ok) {
    throw new Error("Unable to verify the secure session right now.");
  }

  let payload: SessionResponse;
  try {
    payload = (await response.json()) as SessionResponse;
  } catch {
    throw new Error("The secure session response was invalid.");
  }

  const id = payload.user?.id;
  const email = payload.user?.email;
  if (payload.authenticated !== true || typeof id !== "string" || (email !== undefined && email !== null && typeof email !== "string")) {
    throw new Error("The secure session response was invalid.");
  }

  return { id, email: typeof email === "string" ? email : null };
}
