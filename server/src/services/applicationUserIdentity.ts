import { ApplicationUserError } from "./applicationUserErrors.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeAuthUserId(value: string): string {
  const normalized = String(value).trim();
  if (!uuidPattern.test(normalized)) {
    throw new ApplicationUserError("INVALID_AUTH_IDENTITY");
  }
  return normalized.toLowerCase();
}
