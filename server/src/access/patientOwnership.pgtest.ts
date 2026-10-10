import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationError } from "../services/authorizationErrors.js";
import { createPatientOwnershipService, portalOwnPermissions } from "../services/patientOwnershipService.js";
import type { PatientAccountLink, PatientAccountRepository } from "../repositories/patientAccountRepository.js";
import type { AuthorizationContext } from "../services/authorizationService.js";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const pa = "33333333-3333-4333-8333-333333333333";
const pb = "44444444-4444-4444-8444-444444444444";

function context(id: string): AuthorizationContext {
  return {
    userId: id, authUserId: id, email: "fictional@example.test",
    displayName: "Fictional patient", status: "active", roles: ["PATIENT"],
    branchIds: [], permissions: portalOwnPermissions.map((code) => ({ code, scope: "OWN" }))
  };
}

function service(links: Record<string, PatientAccountLink>) {
  const repository: PatientAccountRepository = { async getByUserId(userId) { return links[userId] ?? null; } };
  return createPatientOwnershipService(repository);
}

function denied(code = "AUTHORIZATION_DENIED") {
  return (error: unknown) => error instanceof AuthorizationError && error.code === code;
}

test("two fictional patients resolve only their own explicit active links", async () => {
  const owner = service({
    [a]: { appUserId: a, patientId: pa, status: "active" },
    [b]: { appUserId: b, patientId: pb, status: "active" }
  });
  assert.equal(await owner.requireOwnPatient(context(a), "portal.profile.read"), pa);
  assert.equal(await owner.requireOwnPatient(context(b), "portal.profile.read"), pb);
});

test("pending/revoked/missing/wrong-account links fail closed", async () => {
  for (const link of [
    null,
    { appUserId: a, patientId: pa, status: "pending" as const },
    { appUserId: a, patientId: pa, status: "revoked" as const },
    { appUserId: b, patientId: pb, status: "active" as const }
  ]) {
    await assert.rejects(
      service(link ? { [a]: link } : {}).requireOwnPatient(context(a), "portal.profile.read"),
      denied()
    );
  }
});

test("inactive, mixed-role, branch-assigned, missing-grant and staff users never inherit patient ownership", async () => {
  const owner = service({ [a]: { appUserId: a, patientId: pa, status: "active" } });
  for (const mutate of [
    (c: AuthorizationContext) => { c.status = "pending"; },
    (c: AuthorizationContext) => { c.status = "suspended"; },
    (c: AuthorizationContext) => { c.roles = ["PATIENT", "DENTIST"]; },
    (c: AuthorizationContext) => { c.roles = ["SYSTEM_ADMINISTRATOR"]; },
    (c: AuthorizationContext) => { c.branchIds = [b]; },
    (c: AuthorizationContext) => { c.permissions = []; },
    (c: AuthorizationContext) => { c.permissions = [{ code: "portal.profile.read", scope: "GLOBAL" }]; }
  ]) {
    const c = context(a);
    mutate(c);
    await assert.rejects(owner.requireOwnPatient(c, "portal.profile.read"), denied());
  }
});

test("database errors fail closed without exposing driver details", async () => {
  const owner = createPatientOwnershipService({
    async getByUserId() { throw new Error("database password in private connection URL"); }
  });
  await assert.rejects(owner.requireOwnPatient(context(a), "portal.profile.read"), denied("AUTHORIZATION_PERSISTENCE_ERROR"));
});
