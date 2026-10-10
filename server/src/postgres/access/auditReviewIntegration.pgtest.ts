import assert from "node:assert/strict";
import { resetDisposableTestTables } from "../disposableTestReset.js";
import test from "node:test";
import { buildPgFoundationConfig, summarizeDatabaseUrl } from "../config.js";
import { runPendingMigrations } from "../migrations.js";
import { createPgPoolManager } from "../pool.js";
import { assertSafeTestDatabaseTarget, getPgIntegrationReadiness } from "../testSafety.js";
import { createAuditReviewService } from "../../services/auditReviewService.js";

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

test("Phase 09 PostgreSQL audit review preserves permissions, redaction, request IDs, and audit-of-audit writes", async (t) => {
  const readiness = getPgIntegrationReadiness(process.env);
  if (!readiness.ready) {
    t.skip(readiness.reason || "TEST_DATABASE_URL is not configured for safe PostgreSQL integration.");
    return;
  }

  const pool = createPgPoolManager(buildTestDatabaseConfig());
  await resetKnownTables(pool);

  const branchId = "11111111-1111-4111-8111-111111111111";
  const ownerUserId = "22222222-2222-4222-8222-222222222222";
  const ownerAuthUserId = "33333333-3333-4333-8333-333333333333";
  const sourceAuditId = "44444444-4444-4444-8444-444444444444";
  const sourceRequestId = "55555555-5555-4555-8555-555555555555";
  const reviewRequestId = "66666666-6666-4666-8666-666666666666";
  const exportRequestId = "77777777-7777-4777-8777-777777777777";

  try {
    await runPendingMigrations(pool);

    const grants = await pool.query<{ role_code: string; permission_code: string }>(
      `SELECT r.code AS role_code, p.code AS permission_code
       FROM role_permissions rp
       INNER JOIN roles r ON r.id = rp.role_id
       INNER JOIN permissions p ON p.id = rp.permission_id
       WHERE p.code IN ('audit.read', 'audit.export')
       ORDER BY r.code, p.code`
    );
    assert.deepEqual(grants.rows, [
      { role_code: "CLINIC_ADMINISTRATOR", permission_code: "audit.export" },
      { role_code: "CLINIC_ADMINISTRATOR", permission_code: "audit.read" }
    ]);

    await pool.query(
      `INSERT INTO branches (id, branch_code, branch_name, created_at, updated_at)
       VALUES ($1, 'MAIN', 'Main Fictional Branch', NOW(), NOW())`,
      [branchId]
    );
    await pool.query(
      `INSERT INTO app_users (id, auth_user_id, email, display_name, status, created_at, updated_at)
       VALUES ($1, $2, 'owner@example.test', 'Fictional Owner', 'active', NOW(), NOW())`,
      [ownerUserId, ownerAuthUserId]
    );
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id, assigned_at)
       SELECT $1, id, NOW()
       FROM roles
       WHERE code = 'CLINIC_ADMINISTRATOR'`,
      [ownerUserId]
    );

    await pool.query(
      `INSERT INTO audit_events (
         id, actor_user_id, actor_auth_user_id, action, target_type,
         target_id, branch_id, outcome, metadata, occurred_at, request_id
       ) VALUES ($1, $2, $3, '=FORMULA', 'APP_USER', $2, $4, 'SUCCESS',
                 $5::jsonb, NOW(), $6)`,
      [
        sourceAuditId,
        ownerUserId,
        ownerAuthUserId,
        branchId,
        JSON.stringify({
          apiKey: "should-not-leak",
          nested: { credential: "should-not-leak-either" },
          safeNote: "allowed"
        }),
        sourceRequestId
      ]
    );

    const service = createAuditReviewService(pool);
    const listed = await service.list(
      { limit: 10 },
      { userId: ownerUserId, authUserId: ownerAuthUserId, requestId: reviewRequestId }
    );

    assert.equal(listed.items.length, 1);
    assert.equal(listed.items[0]?.requestId, sourceRequestId);
    assert.deepEqual(listed.items[0]?.metadata, {
      apiKey: "[REDACTED]",
      nested: { credential: "[REDACTED]" },
      safeNote: "allowed"
    });

    const viewed = await pool.query<{ action: string; request_id: string | null }>(
      `SELECT action, request_id
       FROM audit_events
       WHERE action = 'AUDIT_LOG_VIEWED'
       ORDER BY occurred_at DESC
       LIMIT 1`
    );
    assert.equal(viewed.rows[0]?.request_id, reviewRequestId);

    const csv = await service.exportCsv(
      { limit: 100 },
      { userId: ownerUserId, authUserId: ownerAuthUserId, requestId: exportRequestId }
    );
    assert.match(csv, /"'=FORMULA"/);
    assert.match(csv, /\[REDACTED\]/);
    assert.doesNotMatch(csv, /should-not-leak/);

    const exported = await pool.query<{ action: string; request_id: string | null }>(
      `SELECT action, request_id
       FROM audit_events
       WHERE action = 'AUDIT_LOG_EXPORTED'
       ORDER BY occurred_at DESC
       LIMIT 1`
    );
    assert.equal(exported.rows[0]?.request_id, exportRequestId);
  } finally {
    await resetKnownTables(pool);
    await pool.shutdown();
  }
});
