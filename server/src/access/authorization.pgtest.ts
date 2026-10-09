import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgQueryExecutor } from "../postgres/pool.js";
import {
  createAuthorizationRepository,
  type AuthorizationRepository,
  type PermissionGrant
} from "../repositories/authorizationRepository.js";
import type { ApplicationRoleCode } from "../repositories/applicationUserRepository.js";
import { AuthorizationError } from "../services/authorizationErrors.js";
import { createAuthorizationService } from "../services/authorizationService.js";
import type { ApplicationUserContext } from "../services/applicationUserService.js";

const authUserId = "22222222-2222-4222-8222-222222222222";
const appUserId = "33333333-3333-4333-8333-333333333333";
const branchA = "44444444-4444-4444-8444-444444444444";
const branchB = "55555555-5555-4555-8555-555555555555";

const grantsByRole: Record<ApplicationRoleCode, PermissionGrant[]> = {
  PATIENT: [],
  PERSONNEL: [
    { code: "appointment.cancel", scope: "BRANCH" },
    { code: "appointment.check_in", scope: "BRANCH" },
    { code: "appointment.complete", scope: "BRANCH" },
    { code: "appointment.confirm", scope: "BRANCH" },
    { code: "appointment.create", scope: "BRANCH" },
    { code: "appointment.list", scope: "BRANCH" },
    { code: "appointment.no_show", scope: "BRANCH" },
    { code: "appointment.patient_lookup", scope: "BRANCH" },
    { code: "appointment.read", scope: "BRANCH" },
    { code: "appointment.reschedule", scope: "BRANCH" },
    { code: "appointment.update", scope: "BRANCH" },
    { code: "attachment.create", scope: "BRANCH" },
    { code: "attachment.download", scope: "BRANCH" },
    { code: "attachment.read", scope: "BRANCH" },
    { code: "patient.create", scope: "BRANCH" },
    { code: "patient.demographics.update", scope: "BRANCH" },
    { code: "patient.list", scope: "BRANCH" },
    { code: "patient.read", scope: "BRANCH" },
    { code: "treatment.read", scope: "BRANCH" }
  ],
  DENTIST: [
    { code: "appointment.cancel", scope: "BRANCH" },
    { code: "appointment.check_in", scope: "BRANCH" },
    { code: "appointment.complete", scope: "BRANCH" },
    { code: "appointment.confirm", scope: "BRANCH" },
    { code: "appointment.create", scope: "BRANCH" },
    { code: "appointment.list", scope: "BRANCH" },
    { code: "appointment.no_show", scope: "BRANCH" },
    { code: "appointment.patient_lookup", scope: "BRANCH" },
    { code: "appointment.read", scope: "BRANCH" },
    { code: "appointment.reschedule", scope: "BRANCH" },
    { code: "appointment.start", scope: "BRANCH" },
    { code: "appointment.update", scope: "BRANCH" },
    { code: "attachment.create", scope: "BRANCH" },
    { code: "attachment.delete", scope: "BRANCH" },
    { code: "attachment.download", scope: "BRANCH" },
    { code: "attachment.read", scope: "BRANCH" },
    { code: "attachment.update", scope: "BRANCH" },
    { code: "patient.create", scope: "BRANCH" },
    { code: "patient.demographics.update", scope: "BRANCH" },
    { code: "patient.list", scope: "BRANCH" },
    { code: "patient.read", scope: "BRANCH" },
    { code: "treatment.finalize", scope: "BRANCH" },
    { code: "treatment.internal_notes.read", scope: "BRANCH" },
    { code: "treatment.read", scope: "BRANCH" }
  ],
  CLINIC_ADMINISTRATOR: [
    { code: "audit.export", scope: "GLOBAL" },
    { code: "audit.read", scope: "GLOBAL" },
    { code: "role_assignment.approve", scope: "GLOBAL" },
    { code: "staff_account.create", scope: "GLOBAL" },
    { code: "user.read", scope: "GLOBAL" }
  ],
  SYSTEM_ADMINISTRATOR: [
    { code: "role_definition.configure", scope: "GLOBAL" },
    { code: "user.read", scope: "GLOBAL" }
  ]
};

function buildApplicationUser(roles: ApplicationRoleCode[], branchIds: string[] = [branchA]): ApplicationUserContext {
  return {
    userId: appUserId,
    authUserId,
    email: "fictional.user@example.test",
    displayName: "Fictional User",
    status: "active",
    roles,
    branchIds
  };
}

function createFakeAuthorizationRepository(): AuthorizationRepository {
  return {
    async listEffectivePermissionGrants(roleCodes) {
      const unique = new Map<string, PermissionGrant>();
      for (const role of roleCodes) {
        for (const grant of grantsByRole[role]) unique.set(grant.code, grant);
      }
      return [...unique.values()].sort((left, right) => left.code.localeCompare(right.code));
    }
  };
}

function assertAuthorizationError(error: unknown, code: AuthorizationError["code"]): boolean {
  return error instanceof AuthorizationError && error.code === code;
}

test("AuthorizationService combines owner-dentist permissions from separate roles", async () => {
  const service = createAuthorizationService(createFakeAuthorizationRepository());
  const context = await service.resolveContext(buildApplicationUser(["DENTIST", "CLINIC_ADMINISTRATOR"]));

  service.requireBranchPermission(context, "treatment.finalize", branchA);
  service.requirePermission(context, "staff_account.create");
  service.requirePermission(context, "audit.read");
  service.requirePermission(context, "audit.export");
  assert.equal(context.permissions.some((grant) => grant.code === "treatment.internal_notes.read"), true);
  assert.equal(context.permissions.some((grant) => grant.code === "role_assignment.approve"), true);
});

test("Personnel may read branch clinical records but cannot read internal notes or finalize treatment", async () => {
  const service = createAuthorizationService(createFakeAuthorizationRepository());
  const context = await service.resolveContext(buildApplicationUser(["PERSONNEL"]));

  service.requireBranchPermission(context, "patient.read", branchA);
  service.requireBranchPermission(context, "treatment.read", branchA);
  service.requireBranchPermission(context, "attachment.read", branchA);
  service.requireBranchPermission(context, "attachment.create", branchA);
  service.requireBranchPermission(context, "attachment.download", branchA);
  assert.throws(() => service.requireBranchPermission(context, "attachment.update", branchA), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_DENIED")
  );
  assert.throws(() => service.requireBranchPermission(context, "attachment.delete", branchA), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_DENIED")
  );
  assert.throws(() => service.requireBranchPermission(context, "treatment.internal_notes.read", branchA), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_DENIED")
  );
  assert.throws(() => service.requireBranchPermission(context, "treatment.finalize", branchA), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_DENIED")
  );
});

test("Personnel receives only approved Phase 12 appointment permissions on assigned branches", async () => {
  const service = createAuthorizationService(createFakeAuthorizationRepository());
  const context = await service.resolveContext(buildApplicationUser(["PERSONNEL"], [branchA]));

  for (const permission of [
    "appointment.list",
    "appointment.read",
    "appointment.patient_lookup",
    "appointment.create",
    "appointment.update",
    "appointment.confirm",
    "appointment.reschedule",
    "appointment.cancel",
    "appointment.check_in",
    "appointment.complete",
    "appointment.no_show"
  ] as const) {
    service.requireBranchPermission(context, permission, branchA);
  }

  assert.throws(() => service.requireBranchPermission(context, "appointment.start", branchA), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_DENIED")
  );
  assert.throws(() => service.requireBranchPermission(context, "appointment.create", branchB), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_DENIED")
  );
});

test("Dentist may start appointments and owner role union does not grant appointment access through Clinic Administrator", async () => {
  const service = createAuthorizationService(createFakeAuthorizationRepository());
  const dentistContext = await service.resolveContext(buildApplicationUser(["DENTIST"], [branchA]));
  service.requireBranchPermission(dentistContext, "appointment.start", branchA);

  const clinicAdminContext = await service.resolveContext(buildApplicationUser(["CLINIC_ADMINISTRATOR"], [branchA]));
  assert.throws(() => service.requireBranchPermission(clinicAdminContext, "appointment.read", branchA), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_DENIED")
  );

  const ownerContext = await service.resolveContext(buildApplicationUser(["DENTIST", "CLINIC_ADMINISTRATOR"], [branchA]));
  service.requireBranchPermission(ownerContext, "appointment.start", branchA);
  assert.equal(
    grantsByRole.CLINIC_ADMINISTRATOR.some((grant) => grant.code.startsWith("appointment.")),
    false
  );
});

test("Clinic Administrator role alone has no patient or clinical permission", async () => {
  const service = createAuthorizationService(createFakeAuthorizationRepository());
  const context = await service.resolveContext(buildApplicationUser(["CLINIC_ADMINISTRATOR"]));

  service.requirePermission(context, "staff_account.create");
  assert.throws(() => service.requireBranchPermission(context, "patient.read", branchA), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_DENIED")
  );
  assert.throws(() => service.requireBranchPermission(context, "attachment.read", branchA), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_DENIED")
  );
  assert.throws(() => service.requireBranchPermission(context, "appointment.read", branchA), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_DENIED")
  );
});

test("System Administrator remains technical and cannot read patient, clinical, or complete audit records", async () => {
  const service = createAuthorizationService(createFakeAuthorizationRepository());
  const context = await service.resolveContext(buildApplicationUser(["SYSTEM_ADMINISTRATOR"]));

  service.requirePermission(context, "role_definition.configure");
  assert.throws(() => service.requirePermission(context, "audit.read"), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_DENIED")
  );
  assert.throws(() => service.requirePermission(context, "audit.export"), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_DENIED")
  );
  assert.throws(() => service.requireBranchPermission(context, "patient.read", branchA), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_DENIED")
  );
  assert.throws(() => service.requireBranchPermission(context, "treatment.read", branchA), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_DENIED")
  );
  assert.throws(() => service.requireBranchPermission(context, "attachment.read", branchA), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_DENIED")
  );
  assert.throws(() => service.requireBranchPermission(context, "appointment.read", branchA), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_DENIED")
  );
});

test("Dentist-only, Personnel, and Patient roles are denied complete audit review and export", async () => {
  const service = createAuthorizationService(createFakeAuthorizationRepository());

  for (const role of ["DENTIST", "PERSONNEL", "PATIENT"] as const) {
    const context = await service.resolveContext(buildApplicationUser([role]));
    assert.throws(() => service.requirePermission(context, "audit.read"), (error) =>
      assertAuthorizationError(error, "AUTHORIZATION_DENIED")
    );
    assert.throws(() => service.requirePermission(context, "audit.export"), (error) =>
      assertAuthorizationError(error, "AUTHORIZATION_DENIED")
    );
  }
});

test("Patient receives no Phase 12 appointment permissions", async () => {
  const service = createAuthorizationService(createFakeAuthorizationRepository());
  const context = await service.resolveContext(buildApplicationUser(["PATIENT"], [branchA]));

  assert.throws(() => service.requireBranchPermission(context, "appointment.read", branchA), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_DENIED")
  );
});

test("AuthorizationService denies by default when an active user has no roles", async () => {
  const service = createAuthorizationService(createFakeAuthorizationRepository());
  const context = await service.resolveContext(buildApplicationUser([], []));

  assert.deepEqual(context.permissions, []);
  assert.throws(() => service.requirePermission(context, "user.read"), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_DENIED")
  );
});

test("any-branch permission requires a matching grant and at least one assigned branch", async () => {
  const service = createAuthorizationService(createFakeAuthorizationRepository());
  const personnel = await service.resolveContext(buildApplicationUser(["PERSONNEL"], [branchA, branchB]));
  service.requireAnyBranchPermission(personnel, "appointment.list");

  const branchless = await service.resolveContext(buildApplicationUser(["PERSONNEL"], []));
  assert.throws(() => service.requireAnyBranchPermission(branchless, "appointment.list"), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_DENIED")
  );

  const clinicAdmin = await service.resolveContext(buildApplicationUser(["CLINIC_ADMINISTRATOR"], [branchA]));
  assert.throws(() => service.requireAnyBranchPermission(clinicAdmin, "appointment.list"), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_DENIED")
  );
});

test("Branch-scoped permission allows assigned branch and denies another branch", async () => {
  const service = createAuthorizationService(createFakeAuthorizationRepository());
  const context = await service.resolveContext(buildApplicationUser(["PERSONNEL"], [branchA]));

  service.requireBranchPermission(context, "patient.read", branchA.toUpperCase());
  assert.throws(() => service.requireBranchPermission(context, "patient.read", branchB), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_DENIED")
  );
  assert.throws(() => service.requireBranchPermission(context, "patient.read", "not-a-uuid"), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_BRANCH_INVALID")
  );
  assert.throws(() => service.requirePermission(context, "patient.read"), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_BRANCH_REQUIRED")
  );
});

test("GLOBAL grants require no branch assignment", async () => {
  const service = createAuthorizationService(createFakeAuthorizationRepository());
  const context = await service.resolveContext(buildApplicationUser(["CLINIC_ADMINISTRATOR"], []));
  service.requirePermission(context, "user.read");
});

test("OWN-scoped grants deny until ownership evaluation is implemented", async () => {
  const repository: AuthorizationRepository = {
    async listEffectivePermissionGrants() {
      return [{ code: "patient.read", scope: "OWN" }];
    }
  };
  const service = createAuthorizationService(repository);
  const context = await service.resolveContext(buildApplicationUser(["PATIENT"]));

  assert.throws(() => service.requirePermission(context, "patient.read"), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_OWNERSHIP_NOT_IMPLEMENTED")
  );
  assert.throws(() => service.requireBranchPermission(context, "patient.read", branchA), (error) =>
    assertAuthorizationError(error, "AUTHORIZATION_OWNERSHIP_NOT_IMPLEMENTED")
  );
});

class RecordingExecutor implements PgQueryExecutor {
  readonly queries: Array<{ text: string; values: readonly unknown[] }> = [];

  async query<R extends QueryResultRow = QueryResultRow>(text: string, values: readonly unknown[] = []): Promise<QueryResult<R>> {
    this.queries.push({ text, values });
    const rows: QueryResultRow[] = [
      { code: "patient.read", scope: "BRANCH" },
      { code: "treatment.read", scope: "BRANCH" }
    ];
    return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows: rows as R[] };
  }
}

test("AuthorizationRepository uses a parameterized role array and validates grant rows", async () => {
  const executor = new RecordingExecutor();
  const repository = createAuthorizationRepository(executor);
  const grants = await repository.listEffectivePermissionGrants(["PERSONNEL", "DENTIST"]);

  assert.deepEqual(grants, [
    { code: "patient.read", scope: "BRANCH" },
    { code: "treatment.read", scope: "BRANCH" }
  ]);
  assert.equal(executor.queries.length, 1);
  assert.match(executor.queries[0]?.text ?? "", /ANY\(\$1::text\[\]\)/);
  assert.deepEqual(executor.queries[0]?.values, [["PERSONNEL", "DENTIST"]]);

  const noRoleExecutor = new RecordingExecutor();
  assert.deepEqual(await createAuthorizationRepository(noRoleExecutor).listEffectivePermissionGrants([]), []);
  assert.equal(noRoleExecutor.queries.length, 0);
});

test("AuthorizationRepository rejects unknown database permission rows", async () => {
  const executor: PgQueryExecutor = {
    async query<R extends QueryResultRow = QueryResultRow>(): Promise<QueryResult<R>> {
      const rows = [{ code: "unknown.permission", scope: "GLOBAL" }] as QueryResultRow[];
      return { command: "SELECT", rowCount: 1, oid: 0, fields: [], rows: rows as R[] };
    }
  };

  await assert.rejects(
    createAuthorizationRepository(executor).listEffectivePermissionGrants(["PERSONNEL"]),
    /Invalid authorization database field/
  );
});

test("AuthorizationService sanitizes repository persistence failures", async () => {
  const repository: AuthorizationRepository = {
    async listEffectivePermissionGrants() {
      throw new Error("postgresql://secret-user:secret-password@db.example/app");
    }
  };

  await assert.rejects(createAuthorizationService(repository).resolveContext(buildApplicationUser(["PERSONNEL"])), (error) => {
    assert.equal(assertAuthorizationError(error, "AUTHORIZATION_PERSISTENCE_ERROR"), true);
    assert.doesNotMatch((error as Error).message, /secret-password|postgresql:/i);
    return true;
  });
});
