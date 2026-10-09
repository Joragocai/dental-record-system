import assert from "node:assert/strict";
import test from "node:test";
import { buildPgFoundationConfig, summarizeDatabaseUrl } from "../config.js";
import { migrationTableName, runPendingMigrations } from "../migrations.js";
import { createPgPoolManager } from "../pool.js";
import { assertSafeTestDatabaseTarget, getPgIntegrationReadiness } from "../testSafety.js";
import { createAttachmentService } from "../../services/attachmentPrivateService.js";
import { AttachmentError } from "../../services/attachmentErrors.js";
import type {
  AttachmentObject,
  AttachmentStorageAdapter
} from "../../attachments/attachmentStorageAdapter.js";

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
  "app_users",
  "roles",
  "legacy_appointment_identity_map",
  "appointment_history",
  "appointments",
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
  await pool.query("DROP FUNCTION IF EXISTS reject_audit_event_mutation() CASCADE");
}

class FakeStorage implements AttachmentStorageAdapter {
  readonly bytes = new TextEncoder().encode("%PDF-1.7 fictional private attachment");
  deleted = false;

  async ensurePrivateBucket() {}
  async createSignedUpload(objectKey: string) {
    return {
      objectKey,
      signedUrl: "https://storage.example/upload?token=fictional",
      token: "fictional",
      expiresInSeconds: 7200
    };
  }
  async readObject(_objectKey: string): Promise<AttachmentObject> {
    return { bytes: this.bytes, contentType: "application/pdf" };
  }
  async createSignedDownload(_objectKey: string, _originalFilename: string) {
    return { signedUrl: "https://storage.example/download?token=fictional", expiresInSeconds: 120 };
  }
  async deleteObject(_objectKey: string) {
    this.deleted = true;
  }
}

test("Phase 10 PostgreSQL attachment lifecycle enforces parent context and writes correlated audits", async (t) => {
  const readiness = getPgIntegrationReadiness(process.env);
  if (!readiness.ready) {
    t.skip(readiness.reason || "TEST_DATABASE_URL is not configured for safe PostgreSQL integration.");
    return;
  }

  const pool = createPgPoolManager(buildTestDatabaseConfig());
  await resetKnownTables(pool);

  const branchA = "11111111-1111-4111-8111-111111111111";
  const branchB = "22222222-2222-4222-8222-222222222222";
  const patientId = "33333333-3333-4333-8333-333333333333";
  const treatmentId = "44444444-4444-4444-8444-444444444444";
  const userId = "55555555-5555-4555-8555-555555555555";
  const authUserId = "66666666-6666-4666-8666-666666666666";
  const requestId = "77777777-7777-4777-8777-777777777777";
  const attachmentId = "88888888-8888-4888-8888-888888888888";
  const objectId = "99999999-9999-4999-8999-999999999999";

  try {
    await runPendingMigrations(pool);

    await pool.query(
      `INSERT INTO branches (id, branch_code, branch_name, created_at, updated_at)
       VALUES ($1, 'ORIGIN', 'Origin Fictional Branch', NOW(), NOW()),
              ($2, 'SERVICE', 'Service Fictional Branch', NOW(), NOW())`,
      [branchA, branchB]
    );

    await pool.query(
      `INSERT INTO patients (
         id, patient_code, branch_id, date_registered, last_name, first_name,
         birthday, gender, mobile_number, discount_eligibility, created_at, updated_at
       ) VALUES ($1, 'P-2026-9001', $2, '2026-10-08', 'Example', 'Fictional',
                 '2000-01-01', 'Other', '0000000000', 'None', NOW(), NOW())`,
      [patientId, branchA]
    );

    await pool.query(
      `INSERT INTO treatments (
         id, treatment_code, patient_id, branch_id, treatment_date, procedure, dentists,
         amount_charged, discount_type, discount_percent, discount_amount,
         net_amount_due, amount_paid, balance, created_at, updated_at
       ) VALUES (
         $1, 'T-2026-9001', $2, $3, '2026-10-08', 'Fictional procedure', 'Fictional Dentist',
         100, 'None', 0, 0, 100, 0, 100, NOW(), NOW()
       )`,
      [treatmentId, patientId, branchB]
    );

    await pool.query(
      `INSERT INTO app_users (id, auth_user_id, email, display_name, status, created_at, updated_at)
       VALUES ($1, $2, 'fictional@example.test', 'Fictional Dentist', 'active', NOW(), NOW())`,
      [userId, authUserId]
    );

    const ids = [attachmentId, objectId];
    const storage = new FakeStorage();
    const service = createAttachmentService(pool, storage, {
      createId: () => ids.shift() ?? objectId,
      now: () => new Date("2026-10-08T12:00:00.000Z")
    });
    const actor = { userId, authUserId, requestId };

    await assert.rejects(
      service.createUploadIntent({
        patientId,
        treatmentId,
        branchId: branchA,
        category: "X-ray",
        originalFilename: "fictional.pdf",
        mimeType: "application/pdf",
        sizeBytes: storage.bytes.length
      }, actor),
      (error) => error instanceof AttachmentError && error.code === "ATTACHMENT_PARENT_MISMATCH"
    );

    const intent = await service.createUploadIntent({
      patientId,
      treatmentId,
      branchId: branchB,
      category: "X-ray",
      originalFilename: "fictional.pdf",
      mimeType: "application/pdf",
      sizeBytes: storage.bytes.length
    }, actor);
    assert.equal(intent.attachment.status, "pending");
    assert.equal(intent.attachment.branchId, branchB);
    assert.doesNotMatch(intent.upload.objectKey, /fictional|example/i);

    const completed = await service.complete(intent.attachment.id, actor);
    assert.equal(completed.status, "uploaded");
    assert.match(completed.checksumSha256 ?? "", /^[0-9a-f]{64}$/);

    const download = await service.createDownloadUrl(intent.attachment.id, actor);
    assert.equal(download.expiresInSeconds, 120);

    const deleted = await service.deleteAttachment(intent.attachment.id, actor);
    assert.deepEqual(deleted, { id: attachmentId, status: "deleted" });
    assert.equal(storage.deleted, true);

    const audits = await pool.query<{ action: string; request_id: string | null }>(
      `SELECT action, request_id
       FROM audit_events
       WHERE target_id = $1
       ORDER BY occurred_at ASC, id ASC`,
      [attachmentId]
    );
    assert.deepEqual(
      audits.rows.map((row) => [row.action, row.request_id]),
      [
        ["ATTACHMENT_UPLOADED", requestId],
        ["ATTACHMENT_DOWNLOAD_URL_ISSUED", requestId],
        ["ATTACHMENT_DELETED", requestId]
      ]
    );

    const grants = await pool.query<{ role_code: string; permission_code: string }>(
      `SELECT r.code AS role_code, p.code AS permission_code
       FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE p.code LIKE 'attachment.%'
       ORDER BY r.code, p.code`
    );
    assert.deepEqual(grants.rows, [
      { role_code: "DENTIST", permission_code: "attachment.create" },
      { role_code: "DENTIST", permission_code: "attachment.delete" },
      { role_code: "DENTIST", permission_code: "attachment.download" },
      { role_code: "DENTIST", permission_code: "attachment.read" },
      { role_code: "DENTIST", permission_code: "attachment.update" },
      { role_code: "PERSONNEL", permission_code: "attachment.create" },
      { role_code: "PERSONNEL", permission_code: "attachment.download" },
      { role_code: "PERSONNEL", permission_code: "attachment.read" }
    ]);
  } finally {
    await resetKnownTables(pool);
    await pool.shutdown();
  }
});
