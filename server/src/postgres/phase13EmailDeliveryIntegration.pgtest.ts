import assert from "node:assert/strict";
import { resetDisposableTestTables } from "./disposableTestReset.js";
import test from "node:test";
import { buildPgFoundationConfig, summarizeDatabaseUrl } from "./config.js";
import { runPendingMigrations } from "./migrations.js";
import { createPgPoolManager } from "./pool.js";
import { createEmailDeliveryRepository } from "../repositories/emailDeliveryRepository.js";
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

test("Phase 13C delivery claiming prevents duplicate workers and recovers expired leases safely", async (t) => {
  const readiness = getPgIntegrationReadiness(process.env);
  if (!readiness.ready) {
    t.skip(readiness.reason || "TEST_DATABASE_URL is not configured for safe PostgreSQL integration.");
    return;
  }

  const poolA = createPgPoolManager(buildTestDatabaseConfig());
  const poolB = createPgPoolManager(buildTestDatabaseConfig());
  await resetKnownTables(poolA);

  try {
    await runPendingMigrations(poolA);

    const branchId = "a1000000-0000-4000-8000-000000000001";
    const patientId = "a2000000-0000-4000-8000-000000000001";
    const deliveryId = "a3000000-0000-4000-8000-000000000001";

    await poolA.query(
      `INSERT INTO branches (id, branch_code, branch_name, created_at, updated_at)
       VALUES ($1, 'MAIL', 'Mail Test Branch', NOW(), NOW())`,
      [branchId]
    );
    await poolA.query(
      `INSERT INTO patients (
         id, patient_code, branch_id, date_registered, last_name, first_name,
         birthday, gender, mobile_number, email_address, created_at, updated_at
       ) VALUES (
         $1, 'P-MAIL-1', $2, DATE '2026-10-09', 'Recipient', 'Fictional',
         DATE '1990-01-01', 'Other', '09000000000', 'recipient@example.test', NOW(), NOW()
       )`,
      [patientId, branchId]
    );
    await poolA.query(
      `INSERT INTO email_delivery_logs (
         id, recipient_patient_id, category, event_type, template_key,
         source_type, source_id, branch_id, status, attempt_count,
         request_id, dedupe_key, created_at, updated_at
       ) VALUES (
         $1, $2, 'appointment', 'APPOINTMENT_CONFIRMED', 'appointment-confirmed',
         'appointment', 'a4000000-0000-4000-8000-000000000001', $3,
         'pending', 0, 'a5000000-0000-4000-8000-000000000001',
         'email:phase13c:race', $4::timestamptz, $4::timestamptz
       )`,
      [deliveryId, patientId, branchId, "2026-10-09T16:00:00.000Z"]
    );

    const repoA = createEmailDeliveryRepository(poolA);
    const repoB = createEmailDeliveryRepository(poolB);
    const now = "2026-10-09T16:01:00.000Z";

    const [claimA, claimB] = await Promise.all([
      repoA.claimNext(now, 120, 4),
      repoB.claimNext(now, 120, 4)
    ]);
    const claims = [claimA, claimB].filter(Boolean);
    assert.equal(claims.length, 1);
    const firstClaim = claims[0]!;
    assert.equal(firstClaim.id, deliveryId);
    assert.equal(firstClaim.attemptCount, 1);

    const rowAfterFirstClaim = await poolA.query<{
      status: string;
      attempt_count: number;
      lease_expires_at: Date | string | null;
      last_attempt_at: Date | string | null;
    }>(
      "SELECT status, attempt_count, lease_expires_at, last_attempt_at FROM email_delivery_logs WHERE id=$1",
      [deliveryId]
    );
    assert.equal(rowAfterFirstClaim.rows[0]?.status, "processing");
    assert.equal(rowAfterFirstClaim.rows[0]?.attempt_count, 1);

    const beforeExpiry = await repoB.claimNext("2026-10-09T16:02:00.000Z", 120, 4);
    assert.equal(beforeExpiry, null);

    const secondClaim = await repoB.claimNext("2026-10-09T16:03:01.000Z", 120, 4);
    assert.ok(secondClaim);
    assert.equal(secondClaim.id, deliveryId);
    assert.equal(secondClaim.attemptCount, 2);

    assert.equal(
      await repoA.markSent(firstClaim, "2026-10-09T16:03:05.000Z", "stale-provider-message"),
      false
    );

    assert.equal(
      await repoB.markSent(secondClaim, "2026-10-09T16:03:06.000Z", "current-provider-message"),
      true
    );

    const final = await poolA.query<{
      status: string;
      attempt_count: number;
      provider_message_id: string | null;
      lease_expires_at: Date | string | null;
    }>(
      "SELECT status, attempt_count, provider_message_id, lease_expires_at FROM email_delivery_logs WHERE id=$1",
      [deliveryId]
    );
    assert.equal(final.rows[0]?.status, "sent");
    assert.equal(final.rows[0]?.attempt_count, 2);
    assert.equal(final.rows[0]?.provider_message_id, "current-provider-message");
    assert.equal(final.rows[0]?.lease_expires_at, null);

    const exhaustedId = "a3000000-0000-4000-8000-000000000002";
    await poolA.query(
      `INSERT INTO email_delivery_logs (
         id, recipient_patient_id, category, event_type, template_key,
         source_type, source_id, branch_id, status, attempt_count,
         request_id, dedupe_key, created_at, updated_at
       ) VALUES (
         $1, $2, 'appointment', 'APPOINTMENT_CONFIRMED', 'appointment-confirmed',
         'appointment', 'a4000000-0000-4000-8000-000000000002', $3,
         'pending', 4, 'a5000000-0000-4000-8000-000000000002',
         'email:phase13c:exhausted', $4::timestamptz, $4::timestamptz
       )`,
      [exhaustedId, patientId, branchId, "2026-10-09T16:00:00.000Z"]
    );
    assert.equal(
      await repoA.abandonExhausted("2026-10-09T16:04:00.000Z", 4),
      1
    );
    const exhausted = await poolA.query<{ status: string; last_error_code: string | null }>(
      "SELECT status, last_error_code FROM email_delivery_logs WHERE id=$1",
      [exhaustedId]
    );
    assert.deepEqual(exhausted.rows[0], {
      status: "abandoned",
      last_error_code: "MAX_ATTEMPTS_EXHAUSTED"
    });
  } finally {
    await resetKnownTables(poolA);
    await Promise.all([poolA.shutdown(), poolB.shutdown()]);
  }
});
