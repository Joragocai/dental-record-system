import assert from "node:assert/strict";
import { resetDisposableTestTables } from "./disposableTestReset.js";
import test from "node:test";
import { buildPgFoundationConfig, summarizeDatabaseUrl } from "./config.js";
import {
  listMigrationFiles,
  runPendingMigrationsFromList
} from "./migrations.js";
import { createPgPoolManager } from "./pool.js";
import { assertSafeTestDatabaseTarget, getPgIntegrationReadiness } from "./testSafety.js";

function buildTestDatabaseConfig() {
  const config = buildPgFoundationConfig(process.env);
  if (!config.testDatabaseUrl) throw new Error("TEST_DATABASE_URL is not configured.");
  assertSafeTestDatabaseTarget(config.testDatabaseUrl, config.databaseUrl, config.appEnv);
  const summary = summarizeDatabaseUrl(config.testDatabaseUrl, config.sslMode, config.appEnv);
  return { ...config, ...summary, databaseUrl: config.testDatabaseUrl };
}

async function resetKnownTables(pool: ReturnType<typeof createPgPoolManager>): Promise<void> {
  await resetDisposableTestTables(pool);
}

const branchId = "44444444-4444-4444-8444-444444444444";
const patientId = "55555555-5555-4555-8555-555555555555";
const dentistUserId = "66666666-6666-4666-8666-666666666666";
const missingDentistUserId = "77777777-7777-4777-8777-777777777777";
const appointmentIds = [
  "81000000-0000-4000-8000-000000000001",
  "81000000-0000-4000-8000-000000000002",
  "81000000-0000-4000-8000-000000000003",
  "81000000-0000-4000-8000-000000000004",
  "81000000-0000-4000-8000-000000000005",
  "81000000-0000-4000-8000-000000000006"
] as const;

const machineStatuses = [
  "requested",
  "pending_confirmation",
  "confirmed",
  "checked_in",
  "in_progress",
  "completed",
  "cancelled_by_patient",
  "cancelled_by_clinic",
  "no_show",
  "rescheduled"
] as const;

const personnelAppointmentPermissions = [
  "appointment.cancel",
  "appointment.check_in",
  "appointment.complete",
  "appointment.confirm",
  "appointment.create",
  "appointment.list",
  "appointment.no_show",
  "appointment.patient_lookup",
  "appointment.read",
  "appointment.reschedule",
  "appointment.update"
] as const;

const dentistAppointmentPermissions = [
  ...personnelAppointmentPermissions,
  "appointment.start"
].sort();

const personnelNonAppointmentPermissions = [
  "attachment.create",
  "attachment.download",
  "attachment.read",
  "patient.create",
  "patient.demographics.update",
  "patient.list",
  "patient.read",
  "treatment.read"
] as const;

const dentistNonAppointmentPermissions = [
  "attachment.create",
  "attachment.delete",
  "attachment.download",
  "attachment.read",
  "attachment.update",
  "patient.create",
  "patient.demographics.update",
  "patient.list",
  "patient.read",
  "treatment.finalize",
  "treatment.internal_notes.read",
  "treatment.read"
] as const;

test("Phase 12A migration enforces appointment workflow schema, history immutability, and exact RBAC grants", async (t) => {
  const readiness = getPgIntegrationReadiness(process.env);
  if (!readiness.ready) {
    t.skip(readiness.reason || "TEST_DATABASE_URL is not configured for safe PostgreSQL integration.");
    return;
  }

  const pool = createPgPoolManager(buildTestDatabaseConfig());
  await resetKnownTables(pool);

  try {
    const migrations = await listMigrationFiles();
    assert.equal(migrations[10]?.name, "0011_appointment_workflow_redesign.sql");

    await runPendingMigrationsFromList(pool, migrations.slice(0, 10));

    await pool.query(
      `INSERT INTO branches (id, branch_code, branch_name, created_at, updated_at)
       VALUES ($1, 'MAIN', 'Main Fictional Branch', NOW(), NOW())`,
      [branchId]
    );

    await pool.query(
      `INSERT INTO patients (
         id, patient_code, branch_id, date_registered, last_name, first_name,
         birthday, gender, mobile_number, created_at, updated_at
       ) VALUES (
         $1, 'P-2026-0001', $2, DATE '2026-01-01', 'Patient', 'Fictional',
         DATE '1990-01-01', 'Other', '09000000000', NOW(), NOW()
       )`,
      [patientId, branchId]
    );

    const legacyStatuses = ["Scheduled", "Completed", "Cancelled", "No-show"] as const;
    for (let index = 0; index < legacyStatuses.length; index += 1) {
      await pool.query(
        `INSERT INTO appointments (
           id, patient_id, branch_id, appointment_date, appointment_time,
           planned_procedure, notes, status, created_at, updated_at
         ) VALUES ($1, $2, $3, DATE '2026-10-20', TIME '09:00', NULL, NULL, $4, NOW(), NOW())`,
        [appointmentIds[index], patientId, branchId, legacyStatuses[index]]
      );
    }

    await runPendingMigrationsFromList(pool, migrations.slice(10, 11));

    const migratedStatuses = await pool.query<{ id: string; status: string }>(
      `SELECT id::text, status FROM appointments WHERE id = ANY($1::uuid[]) ORDER BY id ASC`,
      [appointmentIds.slice(0, 4)]
    );
    assert.deepEqual(
      migratedStatuses.rows.map((row) => row.status),
      ["confirmed", "completed", "cancelled_by_clinic", "no_show"]
    );

    for (const status of machineStatuses) {
      await pool.query("UPDATE appointments SET status = $2 WHERE id = $1", [appointmentIds[0], status]);
    }

    for (const oldStatus of legacyStatuses) {
      await assert.rejects(
        pool.query("UPDATE appointments SET status = $2 WHERE id = $1", [appointmentIds[0], oldStatus])
      );
    }

    await pool.query(
      `INSERT INTO app_users (id, auth_user_id, email, display_name, status, created_at, updated_at)
       VALUES ($1, NULL, 'dentist@example.test', 'Fictional Dentist', 'active', NOW(), NOW())`,
      [dentistUserId]
    );

    await pool.query(
      "UPDATE appointments SET dentist_user_id = $2 WHERE id = $1",
      [appointmentIds[0], dentistUserId]
    );
    await assert.rejects(
      pool.query("UPDATE appointments SET dentist_user_id = $2 WHERE id = $1", [
        appointmentIds[0],
        missingDentistUserId
      ])
    );

    await pool.query("UPDATE appointments SET duration_minutes = 1 WHERE id = $1", [appointmentIds[0]]);
    await pool.query("UPDATE appointments SET duration_minutes = 1440 WHERE id = $1", [appointmentIds[0]]);
    await assert.rejects(pool.query("UPDATE appointments SET duration_minutes = 0 WHERE id = $1", [appointmentIds[0]]));
    await assert.rejects(pool.query("UPDATE appointments SET duration_minutes = 1441 WHERE id = $1", [appointmentIds[0]]));

    await assert.rejects(
      pool.query("UPDATE appointments SET rescheduled_from_appointment_id = id WHERE id = $1", [appointmentIds[0]])
    );

    for (const id of appointmentIds.slice(4)) {
      await pool.query(
        `INSERT INTO appointments (
           id, patient_id, branch_id, appointment_date, appointment_time,
           planned_procedure, notes, status, created_at, updated_at
         ) VALUES ($1, $2, $3, DATE '2026-10-21', TIME '10:00', NULL, NULL, 'confirmed', NOW(), NOW())`,
        [id, patientId, branchId]
      );
    }

    await pool.query(
      "UPDATE appointments SET rescheduled_from_appointment_id = $2 WHERE id = $1",
      [appointmentIds[4], appointmentIds[0]]
    );
    await assert.rejects(
      pool.query("UPDATE appointments SET rescheduled_from_appointment_id = $2 WHERE id = $1", [
        appointmentIds[5],
        appointmentIds[0]
      ])
    );

    const requestId = "88000000-0000-4000-8000-000000000001";
    const historyId = "89000000-0000-4000-8000-000000000001";
    await pool.query(
      `INSERT INTO appointment_history (
         id, appointment_id, action, previous_status, new_status, actor_user_id,
         request_id, occurred_at
       ) VALUES ($1, $2, 'CONFIRMED', 'pending_confirmation', 'confirmed', $3, $4, NOW())`,
      [historyId, appointmentIds[0], dentistUserId, requestId]
    );

    const history = await pool.query<{ request_id: string }>(
      "SELECT request_id::text FROM appointment_history WHERE id = $1",
      [historyId]
    );
    assert.equal(history.rows[0]?.request_id, requestId);

    await assert.rejects(
      pool.query("UPDATE appointment_history SET action = 'CHANGED' WHERE id = $1", [historyId]),
      /append-only/
    );
    await assert.rejects(
      pool.query("DELETE FROM appointment_history WHERE id = $1", [historyId]),
      /append-only/
    );
    for (const [index, status] of machineStatuses.entries()) {
      const historyStatusId = `89000000-0000-4000-8000-${String(index + 3).padStart(12, "0")}`;
      await pool.query(
        `INSERT INTO appointment_history (
           id, appointment_id, action, previous_status, new_status, occurred_at
         ) VALUES ($1, $2, $3, $4, $4, NOW())`,
        [historyStatusId, appointmentIds[0], `STATUS_${index}`, status]
      );
    }

    await assert.rejects(
      pool.query(
        `INSERT INTO appointment_history (
           id, appointment_id, action, previous_status, new_status, occurred_at
         ) VALUES ('89000000-0000-4000-8000-000000000002', $1, 'INVALID_PREVIOUS', 'Scheduled', 'confirmed', NOW())`,
        [appointmentIds[0]]
      )
    );
    await assert.rejects(
      pool.query(
        `INSERT INTO appointment_history (
           id, appointment_id, action, previous_status, new_status, occurred_at
         ) VALUES ('89000000-0000-4000-8000-000000000013', $1, 'INVALID_NEW', 'confirmed', 'Scheduled', NOW())`,
        [appointmentIds[0]]
      )
    );

    const appointmentPermissions = await pool.query<{ code: string; scope: string }>(
      "SELECT code, scope FROM permissions WHERE code LIKE 'appointment.%' ORDER BY code ASC"
    );
    assert.deepEqual(
      appointmentPermissions.rows.map((row) => row.code),
      [...dentistAppointmentPermissions].sort()
    );
    assert.equal(appointmentPermissions.rows.every((row) => row.scope === "BRANCH"), true);

    const roleMappings = await pool.query<{ role_code: string; permission_code: string }>(
      `SELECT r.code AS role_code, p.code AS permission_code
       FROM role_permissions rp
       INNER JOIN roles r ON r.id = rp.role_id
       INNER JOIN permissions p ON p.id = rp.permission_id
       ORDER BY r.code, p.code`
    );
    const appointmentGrantsFor = (role: string) =>
      roleMappings.rows
        .filter((row) => row.role_code === role && row.permission_code.startsWith("appointment."))
        .map((row) => row.permission_code);

    assert.deepEqual(appointmentGrantsFor("PERSONNEL"), [...personnelAppointmentPermissions]);
    assert.deepEqual(appointmentGrantsFor("DENTIST"), [...dentistAppointmentPermissions].sort());
    assert.deepEqual(appointmentGrantsFor("CLINIC_ADMINISTRATOR"), []);
    assert.deepEqual(appointmentGrantsFor("SYSTEM_ADMINISTRATOR"), []);
    assert.deepEqual(appointmentGrantsFor("PATIENT"), []);

    const grantsFor = (role: string) =>
      roleMappings.rows.filter((row) => row.role_code === role).map((row) => row.permission_code);
    assert.deepEqual(grantsFor("PERSONNEL"), [
      ...personnelNonAppointmentPermissions,
      ...personnelAppointmentPermissions
    ].sort());
    assert.deepEqual(grantsFor("DENTIST"), [
      ...dentistNonAppointmentPermissions,
      ...dentistAppointmentPermissions
    ].sort());
    assert.deepEqual(grantsFor("CLINIC_ADMINISTRATOR"), [
      "audit.export",
      "audit.read",
      "role_assignment.approve",
      "staff_account.create",
      "user.read"
    ]);
    assert.deepEqual(grantsFor("SYSTEM_ADMINISTRATOR"), ["role_definition.configure", "user.read"]);
  } finally {
    await resetKnownTables(pool);
    await pool.shutdown();
  }
});
