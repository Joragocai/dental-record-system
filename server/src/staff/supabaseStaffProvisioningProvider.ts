import type { StaffProvisioningConfig } from "./staffProvisioningConfig.js";
import { StaffProvisioningError } from "../services/staffProvisioningErrors.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface StaffInviteProviderResult {
  providerUserId: string;
}

export interface StaffProvisioningProvider {
  inviteUserByEmail(email: string, redirectTo: string, applicationUserId: string): Promise<StaffInviteProviderResult>;
  sendPasswordRecovery?(email: string, redirectTo: string): Promise<void>;
  deleteUser(providerUserId: string): Promise<boolean>;
}

interface InviteResponsePayload {
  id?: unknown;
  user?: { id?: unknown } | null;
}

function providerHeaders(secretKey: string): Record<string, string> {
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    Accept: "application/json",
    "Content-Type": "application/json"
  };
}

function classifyProviderFailure(status: number): StaffProvisioningError {
  if (status === 400 || status === 409 || status === 422) {
    return new StaffProvisioningError("STAFF_PROVISIONING_PROVIDER_CONFLICT");
  }
  return new StaffProvisioningError("STAFF_PROVISIONING_PROVIDER_UNAVAILABLE");
}

export function createSupabaseStaffProvisioningProvider(
  config: StaffProvisioningConfig,
  fetchImpl: typeof fetch = fetch
): StaffProvisioningProvider {
  return {
    async inviteUserByEmail(email, redirectTo, applicationUserId) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
      try {
        let response: Response;
        try {
          const url = new URL(`${config.supabaseUrl}/auth/v1/invite`);
          url.searchParams.set("redirect_to", redirectTo);
          response = await fetchImpl(url, {
            method: "POST",
            headers: providerHeaders(config.secretKey),
            body: JSON.stringify({
              email,
              data: { application_user_id: applicationUserId }
            }),
            signal: controller.signal
          });
        } catch {
          throw new StaffProvisioningError("STAFF_PROVISIONING_PROVIDER_UNAVAILABLE");
        }

        if (!response.ok) throw classifyProviderFailure(response.status);

        let payload: InviteResponsePayload;
        try {
          payload = (await response.json()) as InviteResponsePayload;
        } catch {
          throw new StaffProvisioningError("STAFF_PROVISIONING_PROVIDER_UNAVAILABLE");
        }

        const providerUserId =
          typeof payload.id === "string"
            ? payload.id
            : typeof payload.user?.id === "string"
              ? payload.user.id
              : null;
        if (!providerUserId || !uuidPattern.test(providerUserId)) {
          throw new StaffProvisioningError("STAFF_PROVISIONING_PROVIDER_UNAVAILABLE");
        }

        return { providerUserId: providerUserId.toLowerCase() };
      } finally {
        clearTimeout(timeout);
      }
    },

    async sendPasswordRecovery(email, redirectTo) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
      try {
        let response: Response;
        try {
          const url = new URL(`${config.supabaseUrl}/auth/v1/recover`);
          url.searchParams.set("redirect_to", redirectTo);
          response = await fetchImpl(url, {
            method: "POST",
            headers: providerHeaders(config.secretKey),
            body: JSON.stringify({ email }),
            signal: controller.signal
          });
        } catch {
          throw new StaffProvisioningError("STAFF_PROVISIONING_PROVIDER_UNAVAILABLE");
        }

        if (!response.ok) throw classifyProviderFailure(response.status);
      } finally {
        clearTimeout(timeout);
      }
    },

    async deleteUser(providerUserId) {
      if (!uuidPattern.test(providerUserId)) return false;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
      try {
        try {
          const response = await fetchImpl(`${config.supabaseUrl}/auth/v1/admin/users/${providerUserId}`, {
            method: "DELETE",
            headers: providerHeaders(config.secretKey),
            body: JSON.stringify({ should_soft_delete: false }),
            signal: controller.signal
          });
          return response.ok;
        } catch {
          return false;
        }
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}
