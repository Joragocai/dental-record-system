import assert from "node:assert/strict";
import test from "node:test";
import { buildPgFoundationConfig, summarizeDatabaseUrl } from "./config.js";
import {
  listMigrationFiles,
  migrationTableName,
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

const resetTables = [
  "email_delivery_logs",
  "notification_preferences",
  "notifications",
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

async function resetKnownTables(pool: ReturnType<typeof createPgPoolManager>): Promise<void> {
  for (const tableName of resetTables) await pool.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
}

test("Phase 13A migration establishes privacy-conscious notification and email delivery foundations", async (t) => {
  const readiness = getPgIntegrationReadiness(process.env);
  if (!readiness.ready) {
    t.skip(readiness.reason || "TEST_DATABASE_URL is not configured for safe PostgreSQL integration.");
    return;
  }

  const pool = createPgPoolManager(buildTestDatabaseConfig());
  await resetKnownTables(pool);

  try {
    const migrations = await listMigrationFiles();
    assert.equal(migrations.at(-1)?.name, "0012_notification_foundation.sql");
    await runPendingMigrationsFromList(pool, migrations);

    const branchId = "91000000-0000-4000-8000-000000000001";
    const userId = "92000000-0000-4000-8000-000000000001";
    const patientId = "93000000-0000-4000-8000-000000000001";
    const notificationId = "94000000-0000-4000-8000-000000000001";
    const preferenceId = "95000000-0000-4000-8000-000000000001";
    const userEmailId = "96000000-0000-4000-8000-000000000001";
    const patientEmailId = "96000000-0000-4000-8000-000000000002";
    const requestId = "97000000-0000-4000-8000-000000000001";
    const sourceId = "98000000-0000-4000-8000-000000000001";

    await pool.query(
      `INSERT INTO branches (id, branch_code, branch_name, created_at, updated_at)
       VALUES ($1, 'N13', 'Notification Test Branch', NOW(), NOW())`,
      [branchId]
    );

    await pool.query(
      `INSERT INTO app_users (id, auth_user_id, email, display_name, status, created_at, updated_at)
       VALUES ($1, NULL, 'staff@example.test', 'Notification Staff', 'active', NOW(), NOW())`,
      [userId]
    );

    await pool.query(
      `INSERT INTO patients (
         id, patient_code, branch_id, date_registered, last_name, first_name,
         birthday, gender, mobile_number, email_address, created_at, updated_at
       ) VALUES (
         $1, 'P-2026-N13', $2, DATE '2026-10-09', 'Patient', 'Notification',
         DATE '1990-01-01', 'Other', '09000000000', 'patient@example.test', NOW(), NOW()
       )`,
      [patientId, branchId]
    );

    await pool.query(
      `INSERT INTO notifications (
         id, recipient_user_id, category, event_type, title, body,
         source_type, source_id, branch_id, request_id, dedupe_key, created_at
       ) VALUES (
         $1, $2, 'appointment', 'APPOINTMENT_CONFIRMED',
         'Appointment confirmed', 'An appointment status changed. Sign in for details.',
         'appointment', $3, $4, $5, 'notification:appointment-confirmed:1', NOW()
       )`,
      [notificationId, userId, sourceId, branchId, requestId]
    );

    const unread = await pool.query<{ read_at: string | null }>(
      "SELECT read_at FROM notifications WHERE id = $1",
      [notificationId]
    );
    assert.equal(unread.rows[0]?.read_at, null);

    await pool.query(
      "UPDATE notifications SET read_at = created_at + INTERVAL '1 second' WHERE id = $1",
      [notificationId]
    );

    await assert.rejects(
      pool.query(
        `INSERT INTO notifications (
           id, recipient_user_id, category, event_type, title, body, dedupe_key, created_at
         ) VALUES (
           '94000000-0000-4000-8000-000000000002', $1, 'appointment',
           'APPOINTMENT_CONFIRMED', 'Duplicate', 'Duplicate body',
           'notification:appointment-confirmed:1', NOW()
         )`,
        [userId]
      )
    );

    await assert.rejects(
      pool.query(
        `INSERT INTO notifications (
           id, recipient_user_id, category, event_type, title, body, dedupe_key, read_at, created_at
         ) VALUES (
           '94000000-0000-4000-8000-000000000003', $1, 'appointment',
           'APPOINTMENT_CONFIRMED', 'Invalid timestamp', 'Invalid timestamp body',
           'notification:invalid-read-time', NOW() - INTERVAL '1 minute', NOW()
         )`,
        [userId]
      )
    );

    await pool.query(
      `INSERT INTO notification_preferences (
         id, user_id, category, in_app_enabled, email_enabled, created_at, updated_at
       ) VALUES ($1, $2, 'appointment', TRUE, FALSE, NOW(), NOW())`,
      [preferenceId, userId]
    );

    await assert.rejects(
      pool.query(
        `INSERT INTO notification_preferences (
           id, user_id, category, in_app_enabled, email_enabled, created_at, updated_at
         ) VALUES (
           '95000000-0000-4000-8000-000000000002', $1, 'appointment', TRUE, TRUE, NOW(), NOW()
         )`,
        [userId]
      )
    );

    await pool.query(
      `INSERT INTO email_delivery_logs (
         id, notification_id, recipient_user_id, category, event_type, template_key,
         source_type, source_id, branch_id, status, request_id, dedupe_key, created_at, updated_at
       ) VALUES (
         $1, $2, $3, 'appointment', 'APPOINTMENT_CONFIRMED', 'appointment-confirmed',
         'appointment', $4, $5, 'pending', $6, 'email:appointment-confirmed:user:1', NOW(), NOW()
       )`,
      [userEmailId, notificationId, userId, sourceId, branchId, requestId]
    );

    await pool.query(
      `INSERT INTO email_delivery_logs (
         id, recipient_patient_id, category, event_type, template_key,
         source_type, source_id, branch_id, status, request_id, dedupe_key, created_at, updated_at
       ) VALUES (
         $1, $2, 'appointment', 'APPOINTMENT_RESCHEDULED', 'appointment-rescheduled',
         'appointment', $3, $4, 'pending', $5, 'email:appointment-rescheduled:patient:1', NOW(), NOW()
       )`,
      [patientEmailId, patientId, sourceId, branchId, requestId]
    );

    await assert.rejects(
      pool.query(
        `INSERT INTO email_delivery_logs (
           id, recipient_user_id, recipient_patient_id, category, event_type, template_key,
           status, dedupe_key, created_at, updated_at
         ) VALUES (
           '96000000-0000-4000-8000-000000000003', $1, $2, 'appointment',
           'APPOINTMENT_CONFIRMED', 'appointment-confirmed', 'pending',
           'email:invalid:both-recipients', NOW(), NOW()
         )`,
        [userId, patientId]
      )
    );

    await assert.rejects(
      pool.query(
        `INSERT INTO email_delivery_logs (
           id, category, event_type, template_key, status, dedupe_key, created_at, updated_at
         ) VALUES (
           '96000000-0000-4000-8000-000000000004', 'appointment',
           'APPOINTMENT_CONFIRMED', 'appointment-confirmed', 'pending',
           'email:invalid:no-recipient', NOW(), NOW()
         )`
      )
    );

    await assert.rejects(
      pool.query(
        `UPDATE email_delivery_logs
         SET status='sent', updated_at=NOW()
         WHERE id=$1`,
        [userEmailId]
      )
    );

    await assert.rejects(
      pool.query(
        `UPDATE email_delivery_logs
         SET status='processing', updated_at=NOW()
         WHERE id=$1`,
        [userEmailId]
      )
    );

    await pool.query(
      `UPDATE email_delivery_logs
       SET status='processing',
           lease_expires_at=NOW() + INTERVAL '2 minutes',
           last_attempt_at=NOW(),
           updated_at=NOW()
       WHERE id=$1`,
      [userEmailId]
    );

    await pool.query(
      `UPDATE email_delivery_logs
       SET status='failed',
           attempt_count=1,
           lease_expires_at=NULL,
           last_attempt_at=NOW(),
           last_error_code='PROVIDER_TEMPORARY',
           next_attempt_at=NOW() + INTERVAL '5 minutes',
           updated_at=NOW()
       WHERE id=$1`,
      [userEmailId]
    );

    const failed = await pool.query<{
      status: string;
      attempt_count: number;
      last_error_code: string | null;
      next_attempt_at: string | null;
    }>(
      `SELECT status, attempt_count, last_error_code, next_attempt_at
       FROM email_delivery_logs WHERE id=$1`,
      [userEmailId]
    );
    assert.equal(failed.rows[0]?.status, "failed");
    assert.equal(failed.rows[0]?.attempt_count, 1);
    assert.equal(failed.rows[0]?.last_error_code, "PROVIDER_TEMPORARY");
    assert.ok(failed.rows[0]?.next_attempt_at);

    await pool.query(
      `UPDATE email_delivery_logs
       SET status='sent',
           sent_at=NOW(),
           next_attempt_at=NULL,
           lease_expires_at=NULL,
           last_error_code=NULL,
           provider_message_id='provider-msg-1',
           updated_at=NOW()
       WHERE id=$1`,
      [userEmailId]
    );

    const sent = await pool.query<{ status: string; sent_at: string | null }>(
      "SELECT status, sent_at FROM email_delivery_logs WHERE id=$1",
      [userEmailId]
    );
    assert.equal(sent.rows[0]?.status, "sent");
    assert.ok(sent.rows[0]?.sent_at);

    const columns = await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name IN ('notifications', 'notification_preferences', 'email_delivery_logs')
       ORDER BY table_name, ordinal_position`
    );

    const notificationColumns = columns.rows.map((row) => `${row.table_name}.${row.column_name}`);
    assert.equal(notificationColumns.some((name) => /sms/i.test(name)), false);
    assert.equal(notificationColumns.some((name) => /recipient_email/i.test(name)), false);
    assert.equal(notificationColumns.some((name) => /email_address/i.test(name)), false);
  } finally {
    await resetKnownTables(pool);
    await pool.shutdown();
  }
});
