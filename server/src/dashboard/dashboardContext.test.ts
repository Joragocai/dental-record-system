import assert from "node:assert/strict";
import test from "node:test";
import { projectDashboardContext } from "./dashboardContext.js";
import type { AuthorizationContext } from "../services/authorizationService.js";

function context(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  return {
    userId: "10000000-0000-4000-8000-000000000001",
    authUserId: "10000000-0000-4000-8000-000000000002",
    email: "fictional@example.test",
    displayName: "Fictional User",
    status: "active",
    roles: ["PERSONNEL"],
    branchIds: ["10000000-0000-4000-8000-000000000003"],
    permissions: [{ code: "appointment.list", scope: "BRANCH" }],
    ...overrides
  };
}

test("branch access requires assigned branch and exact permitted grant", () => {
  assert.deepEqual(projectDashboardContext(context()).links.map((l) => l.key), ["appointments"]);
  assert.deepEqual(projectDashboardContext(context({ branchIds: [] })).links, []);
  assert.deepEqual(projectDashboardContext(context({ permissions: [] })).links, []);
  assert.deepEqual(projectDashboardContext(context({ permissions: [{ code: "appointment.list", scope: "OWN" }] })).links, []);
});

test("patient-request review shortcut matches actual cancel/reschedule authorization", () => {
  const cancellation = context({ permissions: [{ code: "appointment.cancel", scope: "BRANCH" }] });
  assert.deepEqual(projectDashboardContext(cancellation).links.map((link) => link.key), ["clinic-patient-requests"]);
  const reschedule = context({ permissions: [{ code: "appointment.reschedule", scope: "BRANCH" }] });
  assert.deepEqual(projectDashboardContext(reschedule).links.map((link) => link.key), ["clinic-patient-requests"]);
  assert.deepEqual(projectDashboardContext(context({ permissions: [{ code: "appointment.confirm", scope: "BRANCH" }] })).links, []);
  assert.deepEqual(projectDashboardContext(context({ branchIds: [], permissions: cancellation.permissions })).links, []);
  assert.deepEqual(projectDashboardContext(context({ roles: ["CLINIC_ADMINISTRATOR"], permissions: cancellation.permissions })).links, []);
  assert.deepEqual(projectDashboardContext(context({ permissions: [{ code: "appointment.cancel", scope: "GLOBAL" }] })).links, []);
});

test("patient OWN projection does not expose clinic shortcuts", () => {
  const projected = projectDashboardContext(context({
    roles: ["PATIENT"], branchIds: [],
    permissions: [{ code: "portal.profile.read", scope: "OWN" }, { code: "portal.balance.read", scope: "OWN" }]
  }));
  assert.deepEqual(projected.links.map((l) => l.key), ["patient-portal", "patient-finance"]);
  assert.deepEqual(projected.branchIds, []);
});

test("admin does not inherit dentist authority and technical-only role has no clinic links", () => {
  assert.deepEqual(projectDashboardContext(context({
    roles: ["CLINIC_ADMINISTRATOR"], branchIds: [],
    permissions: [{ code: "finance.admin.read", scope: "GLOBAL" }]
  })).links, []);
  assert.deepEqual(projectDashboardContext(context({
    roles: ["SYSTEM_ADMINISTRATOR"], branchIds: [],
    permissions: [{ code: "user.read", scope: "GLOBAL" }, { code: "role_definition.configure", scope: "GLOBAL" }]
  })).links, []);
});

test("owner-dentist union honors each explicitly granted permission", () => {
  const projected = projectDashboardContext(context({
    roles: ["DENTIST", "CLINIC_ADMINISTRATOR"],
    permissions: [{ code: "appointment.list", scope: "BRANCH" }, { code: "finance.daily.read", scope: "GLOBAL" }]
  }));
  assert.deepEqual(projected.links.map((l) => l.key), ["appointments", "clinic-finance"]);
  assert.deepEqual(projected.roles, ["CLINIC_ADMINISTRATOR", "DENTIST"]);
});

test("inactive, unassigned and unexpected roles fail closed", () => {
  assert.throws(() => projectDashboardContext(context({ status: "deactivated" })));
  assert.throws(() => projectDashboardContext(context({ roles: [] })));
  assert.throws(() => projectDashboardContext(context({ roles: ["INVENTED" as AuthorizationContext["roles"][number]] })));
});
