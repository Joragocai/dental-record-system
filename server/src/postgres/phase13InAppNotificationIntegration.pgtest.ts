import assert from "node:assert/strict";
import test from "node:test";
import { buildPgFoundationConfig, summarizeDatabaseUrl } from "./config.js";
import { migrationTableName, runPendingMigrations } from "./migrations.js";
import { createPgPoolManager } from "./pool.js";
import { assertSafeTestDatabaseTarget, getPgIntegrationReadiness } from "./testSafety.js";
import { createInAppNotificationService } from "../services/inAppNotificationService.js";
import { InAppNotificationError } from "../services/inAppNotificationErrors.js";

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
  for (const table of resetTables) await pool.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
}

function expectNotificationCode(code: string) {
  return (error: unknown) => error instanceof InAppNotificationError && error.code === code;
}

test("Phase 13D in-app notifications remain strictly recipient-owned with durable read state", async (t) => {
  const readiness = getPgIntegrationReadiness(process.env);
  if (!readiness.ready) {
    t.skip(readiness.reason || "TEST_DATABASE_URL is not configured for safe PostgreSQL integration.");
    return;
  }

  const pool = createPgPoolManager(buildTestDatabaseConfig());
  await resetKnownTables(pool);

  try {
    await runPendingMigrations(pool);

    const userA = "b1000000-0000-4000-8000-000000000001";
    const userB = "b1000000-0000-4000-8000-000000000002";
    const notificationAUnread = "b2000000-0000-4000-8000-000000000001";
    const notificationARead = "b2000000-0000-4000-8000-000000000002";
    const notificationB = "b2000000-0000-4000-8000-000000000003";

    await pool.query(
      `INSERT INTO app_users (id, auth_user_id, email, display_name, status, created_at, updated_at)
       VALUES
         ($1, 'b3000000-0000-4000-8000-000000000001', 'user-a@example.test', 'User A', 'active', NOW(), NOW()),
         ($2, 'b3000000-0000-4000-8000-000000000002', 'user-b@example.test', 'User B', 'active', NOW(), NOW())`,
      [userA, userB]
    );

    await pool.query(
      `INSERT INTO notifications (
         id, recipient_user_id, category, event_type, title, body,
         request_id, dedupe_key, read_at, created_at
       ) VALUES
         ($1, $4, 'account', 'ACCOUNT_NOTICE', 'Newest for A', 'Fictional account update.',
          'b4000000-0000-4000-8000-000000000001', 'notification:13d:a:new', NULL, '2026-10-10T01:00:00.000Z'),
         ($2, $4, 'system', 'SYSTEM_NOTICE', 'Older for A', 'Fictional system update.',
          'b4000000-0000-4000-8000-000000000002', 'notification:13d:a:old', '2026-10-10T00:31:00.000Z', '2026-10-10T00:30:00.000Z'),
         ($3, $5, 'account', 'ACCOUNT_NOTICE', 'Only for B', 'Fictional account update for B.',
          'b4000000-0000-4000-8000-000000000003', 'notification:13d:b', NULL, '2026-10-10T00:45:00.000Z')`,
      [notificationAUnread, notificationARead, notificationB, userA, userB]
    );

    const service = createInAppNotificationService(pool, {
      now: () => new Date("2026-10-10T02:00:00.000Z")
    });

    const listA = await service.list(userA);
    assert.deepEqual(listA.map((row) => row.id), [notificationAUnread, notificationARead]);
    assert.equal(listA.some((row) => row.id === notificationB), false);
    assert.equal((await service.list(userA, 1)).length, 1);

    assert.equal(await service.unreadCount(userA), 1);
    assert.equal(await service.unreadCount(userB), 1);

    assert.deepEqual(await service.markRead(userA, notificationAUnread), { read: true });
    assert.equal(await service.unreadCount(userA), 0);

    const firstRead = await pool.query<{ read_at: Date | string | null }>(
      "SELECT read_at FROM notifications WHERE id=$1",
      [notificationAUnread]
    );
    assert.ok(firstRead.rows[0]?.read_at);

    assert.deepEqual(await service.markRead(userA, notificationAUnread), { read: true });
    const secondRead = await pool.query<{ read_at: Date | string | null }>(
      "SELECT read_at FROM notifications WHERE id=$1",
      [notificationAUnread]
    );
    assert.equal(
      new Date(secondRead.rows[0]!.read_at!).toISOString(),
      new Date(firstRead.rows[0]!.read_at!).toISOString()
    );

    await assert.rejects(
      service.markRead(userA, notificationB),
      expectNotificationCode("NOTIFICATION_NOT_FOUND")
    );
    assert.equal(await service.unreadCount(userB), 1);

    assert.deepEqual(await service.markAllRead(userB), { markedRead: 1 });
    assert.equal(await service.unreadCount(userB), 0);
    assert.deepEqual(await service.markAllRead(userB), { markedRead: 0 });

    await assert.rejects(
      service.list(userA, 101),
      expectNotificationCode("NOTIFICATION_INPUT_INVALID")
    );
  } finally {
    await resetKnownTables(pool);
    await pool.shutdown();
  }
});
