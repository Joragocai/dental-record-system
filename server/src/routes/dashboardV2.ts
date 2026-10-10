import { projectDashboardContext } from "../dashboard/dashboardContext.js";
import type { AuthorizationContext } from "../services/authorizationService.js";

interface DashboardResponse {
  locals: { authorization?: AuthorizationContext };
  status(status: number): { json(payload: { message: string }): void };
  setHeader(name: string, value: string): void;
  json(payload: ReturnType<typeof projectDashboardContext>): void;
}

export function sendDashboardContext(res: DashboardResponse): void {
  const context = res.locals.authorization;
  res.setHeader("Cache-Control", "no-store");
  if (!context || context.status !== "active" || !context.roles.length) {
    res.status(403).json({ message: "Dashboard access is not available." });
    return;
  }
  res.json(projectDashboardContext(context));
}
