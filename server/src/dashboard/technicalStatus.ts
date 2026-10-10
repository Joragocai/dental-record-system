import type { AuthorizationContext } from "../services/authorizationService.js";
import { projectDashboardContext } from "./dashboardContext.js";

export interface TechnicalStatus {
  api: "reachable";
  readiness: "ready" | "unavailable";
}

export function requireTechnicalStatusAccess(context: AuthorizationContext | undefined): void {
  if (!context || context.status !== "active" || context.roles.length !== 1 ||
      context.roles[0] !== "SYSTEM_ADMINISTRATOR" ||
      !projectDashboardContext(context).systemAdministrator?.technicalAccountRead) {
    const error = new Error("Technical status access is unavailable.") as Error & { status: number };
    error.status = 403;
    throw error;
  }
}

export async function getTechnicalStatus(
  context: AuthorizationContext | undefined,
  checkReadiness: () => Promise<boolean>
): Promise<TechnicalStatus> {
  requireTechnicalStatusAccess(context);
  let ready = false;
  try { ready = await checkReadiness() === true; } catch { ready = false; }
  return { api: "reachable", readiness: ready ? "ready" : "unavailable" };
}
