import assert from "node:assert/strict";
import test from "node:test";
import { buildPgFoundationConfig, summarizeDatabaseUrl } from "./config.js";
import { runPendingMigrations, migrationTableName } from "./migrations.js";
import { createPgPoolManager } from "./pool.js";
import { assertSafeTestDatabaseTarget, getPgIntegrationReadiness } from "./testSafety.js";
import { createAppointmentDomainService, type AppointmentActor } from "../services/appointmentDomainService.js";
import { AppointmentDomainError } from "../services/appointmentDomainErrors.js";
import type { PermissionCode } from "../repositories/authorizationRepository.js";

function buildTestDatabaseConfig() {
  const config = buildPgFoundationConfig(process.env);
  if (!config.testDatabaseUrl) throw new Error("TEST_DATABASE_URL is not configured.");
  assertSafeTestDatabaseTarget(config.testDatabaseUrl, config.databaseUrl, config.appEnv);
  const summary = summarizeDatabaseUrl(config.testDatabaseUrl, config.sslMode, config.appEnv);
  return { ...config, ...summary, databaseUrl: config.testDatabaseUrl };
}

const resetTables = [
  "audit_events",
  "attachments",
  "role_permissions",
  "permissions",
  "user_branches",
  "user_roles",
  "appointment_history",
  "legacy_appointment_identity_map",
  "appointments",
  "app_users",
  "roles",
  "legacy_treatment_identity_map",
  "treatments",
  "treatment_code_counters",
  "legacy_patient_identity_map",
  "patients",
  "patient_code_counters",
  "branches",
  "drs_v2_foundation_probe",
  migrationTableName
] as const;

async function reset(pool: ReturnType<typeof createPgPoolManager>) {
  for (const table of resetTables) await pool.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
}

const branchA = "41000000-0000-4000-8000-000000000001";
const branchB = "41000000-0000-4000-8000-000000000002";
const patientId = "42000000-0000-4000-8000-000000000001";
const dentistId = "43000000-0000-4000-8000-000000000001";
const personnelId = "43000000-0000-4000-8000-000000000002";
const dentistAuthId = "44000000-0000-4000-8000-000000000001";
const personnelAuthId = "44000000-0000-4000-8000-000000000002";

const personnelPermissions: PermissionCode[] = [
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
];

const dentistPermissions: PermissionCode[] = [...personnelPermissions, "appointment.start"];

function actor(
  kind: "personnel" | "dentist",
  requestId: string,
  branches: readonly string[] = [branchA, branchB]
): AppointmentActor {
  return kind === "personnel"
    ? {
        userId: personnelId,
        authUserId: personnelAuthId,
        requestId,
        branchIds: branches,
        permissions: personnelPermissions
      }
    : {
        userId: dentistId,
        authUserId: dentistAuthId,
        requestId,
        branchIds: branches,
        permissions: dentistPermissions
      };
}

function expectCode(code: string) {
  return (error: unknown) => error instanceof AppointmentDomainError && error.code === code;
}

async function seedFoundation(pool: ReturnType<typeof createPgPoolManager>) {
  await pool.query(
    `INSERT INTO branches (id, branch_code, branch_name, created_at, updated_at)
     VALUES ($1,'A','Fictional Branch A',NOW(),NOW()),($2,'B','Fictional Branch B',NOW(),NOW())`,
    [branchA, branchB]
  );
  await pool.query(
    `INSERT INTO patients (
       id, patient_code, branch_id, date_registered, last_name, first_name, birthday,
       gender, mobile_number, created_at, updated_at
     ) VALUES ($1,'P-2026-9001',$2,DATE '2026-01-01','Patient','Fictional',DATE '1990-01-01',
       'Other','09000000000',NOW(),NOW())`,
    [patientId, branchA]
  );
  await pool.query(
    `INSERT INTO app_users (id, auth_user_id, email, display_name, status, created_at, updated_at)
     VALUES
       ($1,$2,'dentist.phase12@example.test','Fictional Dentist','active',NOW(),NOW()),
       ($3,$4,'personnel.phase12@example.test','Fictional Personnel','active',NOW(),NOW())`,
    [dentistId, dentistAuthId, personnelId, personnelAuthId]
  );
  await pool.query(
    `INSERT INTO user_roles (user_id, role_id, assigned_at)
     SELECT $1::uuid, id, NOW() FROM roles WHERE code='DENTIST'
     UNION ALL
     SELECT $2::uuid, id, NOW() FROM roles WHERE code='PERSONNEL'`,
    [dentistId, personnelId]
  );
  for (const userId of [dentistId, personnelId]) {
    await pool.query(
      `INSERT INTO user_branches (user_id, branch_id, assigned_at)
       VALUES ($1,$2,NOW()),($1,$3,NOW())`,
      [userId, branchA, branchB]
    );
  }
}

test("Phase 12B appointment domain enforces workflow, cross-branch overlap safety, history, and audit", async (t) => {
  const readiness = getPgIntegrationReadiness(process.env);
  if (!readiness.ready) {
    t.skip(readiness.reason || "TEST_DATABASE_URL is not configured for safe PostgreSQL integration.");
    return;
  }

  const pool = createPgPoolManager(buildTestDatabaseConfig());
  await reset(pool);

  try {
    await runPendingMigrations(pool);
    await seedFoundation(pool);

    const fixedNow = new Date("2026-10-09T10:00:00.000Z");
    const service = createAppointmentDomainService(pool, { now: () => fixedNow });

    const context = await service.getSchedulingContext(
      branchA,
      actor("personnel", "45000000-0000-4000-8000-000000000001")
    );
    assert.equal(context.branch.id, branchA);
    assert.deepEqual(context.dentists.map((item) => item.id), [dentistId]);

    const patients = await service.searchPatients(
      "Fictional",
      branchB,
      actor("personnel", "45000000-0000-4000-8000-000000000002")
    );
    assert.deepEqual(patients, [
      {
        id: patientId,
        patientCode: "P-2026-9001",
        displayName: "Fictional Patient",
        mobileNumber: "09000000000"
      }
    ]);

    const first = await service.createAppointment(
      {
        patientId,
        branchId: branchA,
        dentistUserId: dentistId,
        appointmentDate: "2026-10-10",
        appointmentTime: "09:00",
        durationMinutes: 60,
        plannedProcedure: "Consultation"
      },
      actor("personnel", "45000000-0000-4000-8000-000000000003")
    );
    assert.equal(first.status, "confirmed");

    await assert.rejects(
      service.createAppointment(
        {
          patientId,
          branchId: branchB,
          dentistUserId: dentistId,
          appointmentDate: "2026-10-10",
          appointmentTime: "09:30",
          durationMinutes: 30
        },
        actor("personnel", "45000000-0000-4000-8000-000000000004")
      ),
      expectCode("APPOINTMENT_SLOT_CONFLICT")
    );

    const adjacent = await service.createAppointment(
      {
        patientId,
        branchId: branchB,
        dentistUserId: dentistId,
        appointmentDate: "2026-10-10",
        appointmentTime: "10:00",
        durationMinutes: 30
      },
      actor("personnel", "45000000-0000-4000-8000-000000000005")
    );
    assert.equal(adjacent.status, "confirmed");

    const availability = await service.checkAvailability(
      {
        branchId: branchA,
        dentistUserId: dentistId,
        appointmentDate: "2026-10-10",
        appointmentTime: "09:45",
        durationMinutes: 30
      },
      actor("personnel", "45000000-0000-4000-8000-000000000006")
    );
    assert.equal(availability.available, false);

    const concurrentInputs = [
      {
        patientId,
        branchId: branchA,
        dentistUserId: dentistId,
        appointmentDate: "2026-10-11",
        appointmentTime: "11:00",
        durationMinutes: 60
      },
      {
        patientId,
        branchId: branchB,
        dentistUserId: dentistId,
        appointmentDate: "2026-10-11",
        appointmentTime: "11:15",
        durationMinutes: 30
      }
    ] as const;
    const concurrent = await Promise.allSettled(
      concurrentInputs.map((input, index) =>
        service.createAppointment(
          input,
          actor("personnel", `45000000-0000-4000-8000-00000000001${index + 0}`)
        )
      )
    );
    assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = concurrent.find((result) => result.status === "rejected");
    assert.ok(rejected && rejected.status === "rejected");
    assert.equal(expectCode("APPOINTMENT_SLOT_CONFLICT")(rejected.reason), true);

    const pending = await service.createAppointment(
      {
        patientId,
        branchId: branchA,
        appointmentDate: "2026-10-12",
        status: "pending_confirmation"
      },
      actor("personnel", "45000000-0000-4000-8000-000000000020")
    );
    assert.equal(pending.dentistUserId, null);
    assert.equal(pending.appointmentTime, null);

    const confirmed = await service.confirmAppointment(
      pending.id,
      {
        appointmentTime: "13:00",
        durationMinutes: 45,
        dentistUserId: dentistId
      },
      actor("personnel", "45000000-0000-4000-8000-000000000021")
    );
    assert.equal(confirmed.status, "confirmed");

    const checkedIn = await service.checkInAppointment(
      confirmed.id,
      actor("personnel", "45000000-0000-4000-8000-000000000022")
    );
    assert.equal(checkedIn.status, "checked_in");

    await assert.rejects(
      service.startAppointment(
        checkedIn.id,
        actor("personnel", "45000000-0000-4000-8000-000000000023")
      ),
      expectCode("APPOINTMENT_PERMISSION_DENIED")
    );

    const started = await service.startAppointment(
      checkedIn.id,
      actor("dentist", "45000000-0000-4000-8000-000000000024")
    );
    assert.equal(started.status, "in_progress");

    const completed = await service.completeAppointment(
      started.id,
      actor("personnel", "45000000-0000-4000-8000-000000000025")
    );
    assert.equal(completed.status, "completed");

    await assert.rejects(
      service.markNoShow(
        completed.id,
        actor("personnel", "45000000-0000-4000-8000-000000000026")
      ),
      expectCode("APPOINTMENT_STATE_INVALID")
    );

    const rescheduleSource = await service.createAppointment(
      {
        patientId,
        branchId: branchA,
        dentistUserId: dentistId,
        appointmentDate: "2026-10-13",
        appointmentTime: "09:00",
        durationMinutes: 30
      },
      actor("personnel", "45000000-0000-4000-8000-000000000027")
    );
    const replacement = await service.rescheduleAppointment(
      rescheduleSource.id,
      {
        branchId: branchB,
        dentistUserId: dentistId,
        appointmentDate: "2026-10-13",
        appointmentTime: "09:15",
        durationMinutes: 45,
        reason: "Clinic scheduling adjustment"
      },
      actor("personnel", "45000000-0000-4000-8000-000000000028")
    );
    assert.equal(replacement.branchId, branchB);
    assert.equal(replacement.rescheduledFromAppointmentId, rescheduleSource.id);
    assert.equal(replacement.status, "confirmed");

    const originalAfter = await service.getAppointment(
      rescheduleSource.id,
      actor("personnel", "45000000-0000-4000-8000-000000000029")
    );
    assert.equal(originalAfter.status, "rescheduled");

    const noShowSource = await service.createAppointment(
      {
        patientId,
        branchId: branchA,
        dentistUserId: dentistId,
        appointmentDate: "2026-10-14",
        appointmentTime: "09:00",
        durationMinutes: 30
      },
      actor("personnel", "45000000-0000-4000-8000-000000000030")
    );
    const noShow = await service.markNoShow(
      noShowSource.id,
      actor("personnel", "45000000-0000-4000-8000-000000000031")
    );
    assert.equal(noShow.status, "no_show");

    const cancelSource = await service.createAppointment(
      {
        patientId,
        branchId: branchA,
        appointmentDate: "2026-10-15",
        status: "requested"
      },
      actor("personnel", "45000000-0000-4000-8000-000000000032")
    );
    const cancelled = await service.cancelAppointment(
      cancelSource.id,
      { reason: "Clinic cancellation" },
      actor("personnel", "45000000-0000-4000-8000-000000000033")
    );
    assert.equal(cancelled.status, "cancelled_by_clinic");

    const historyResult = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM appointment_history"
    );
    const auditResult = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM audit_events WHERE target_type='APPOINTMENT'"
    );
    assert.ok(Number(historyResult.rows[0]?.count ?? 0) >= 12);
    assert.ok(Number(auditResult.rows[0]?.count ?? 0) >= 11);

    const correlated = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM appointment_history h
       INNER JOIN audit_events a ON a.request_id = h.request_id
       WHERE h.request_id IS NOT NULL AND a.target_type='APPOINTMENT'`
    );
    assert.ok(Number(correlated.rows[0]?.count ?? 0) >= 10);

    const requestRows = await service.createAppointment(
      {
        patientId,
        branchId: branchA,
        appointmentDate: "2026-10-16",
        status: "requested"
      },
      actor("personnel", "45000000-0000-4000-8000-000000000034")
    );
    assert.equal(requestRows.status, "requested");

    await assert.rejects(
      service.createAppointment(
        {
          patientId,
          branchId: branchA,
          dentistUserId: dentistId,
          appointmentDate: "2026-10-09",
          appointmentTime: "09:00",
          durationMinutes: 30
        },
        actor("personnel", "45000000-0000-4000-8000-000000000035")
      ),
      expectCode("APPOINTMENT_INPUT_INVALID")
    );

    await assert.rejects(
      service.createAppointment(
        {
          patientId,
          branchId: branchA,
          appointmentDate: "2026-10-08",
          status: "requested"
        },
        actor("personnel", "45000000-0000-4000-8000-000000000037")
      ),
      expectCode("APPOINTMENT_INPUT_INVALID")
    );

    const providerStateSource = await service.createAppointment(
      {
        patientId,
        branchId: branchA,
        dentistUserId: dentistId,
        appointmentDate: "2026-10-17",
        appointmentTime: "09:00",
        durationMinutes: 30
      },
      actor("personnel", "45000000-0000-4000-8000-000000000038")
    );
    await pool.query("UPDATE app_users SET status='deactivated', updated_at=NOW() WHERE id=$1", [dentistId]);
    await assert.rejects(
      service.checkInAppointment(
        providerStateSource.id,
        actor("personnel", "45000000-0000-4000-8000-000000000039")
      ),
      expectCode("APPOINTMENT_DENTIST_INVALID")
    );
    const cancelledAfterDeactivation = await service.cancelAppointment(
      providerStateSource.id,
      { reason: "Provider became unavailable" },
      actor("personnel", "45000000-0000-4000-8000-000000000040")
    );
    assert.equal(cancelledAfterDeactivation.status, "cancelled_by_clinic");

    await assert.rejects(
      service.getSchedulingContext(
        branchB,
        actor("personnel", "45000000-0000-4000-8000-000000000036", [branchA])
      ),
      expectCode("APPOINTMENT_PERMISSION_DENIED")
    );
  } finally {
    await reset(pool);
    await pool.shutdown();
  }
});
