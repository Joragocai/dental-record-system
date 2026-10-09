import crypto from "node:crypto";
import { assertPgMutationAllowed, buildPgFoundationConfig } from "../postgres/config.js";
import { assertSupabaseDatabaseIdentity } from "../config/hostedSafety.js";
import { createPgPoolManager } from "../postgres/pool.js";
import { createApplicationUserRepository } from "../repositories/applicationUserRepository.js";
import { createAuthorizationRepository } from "../repositories/authorizationRepository.js";
import { createApplicationUserService } from "../services/applicationUserService.js";
import { createAuthorizationService } from "../services/authorizationService.js";
import { createAttachmentService } from "../services/attachmentPrivateService.js";
import { buildAttachmentStorageConfig } from "./attachmentStorageConfig.js";
import { createSupabaseAttachmentStorageAdapter } from "./attachmentStorageAdapter.js";

export function assertAttachmentLiveValidationTarget(env: NodeJS.ProcessEnv = process.env): void {
  if (env.ATTACHMENT_LIVE_VALIDATION !== "YES") {
    throw new Error("Set ATTACHMENT_LIVE_VALIDATION=YES to run the fictional private-storage validation.");
  }

  const config = buildPgFoundationConfig(env);
  const target = String(env.ATTACHMENT_LIVE_VALIDATION_TARGET ?? "local").trim().toLowerCase();

  if (target === "local") {
    if (config.appEnv !== "local") {
      throw new Error("Local attachment live validation requires DENTAL_SERVER_ENV=local.");
    }
    return;
  }

  if (target === "staging") {
    if (config.appEnv !== "staging") {
      throw new Error("Staging attachment live validation requires DENTAL_SERVER_ENV=staging.");
    }
    assertPgMutationAllowed(config);
    const storage = buildAttachmentStorageConfig(env);
    if (storage.bucket !== "dental-attachments-staging") {
      throw new Error("Staging attachment live validation requires dental-attachments-staging.");
    }
    assertSupabaseDatabaseIdentity(config.databaseUrl, storage.supabaseUrl);
    return;
  }

  throw new Error("ATTACHMENT_LIVE_VALIDATION_TARGET must be local or staging.");
}

async function main(): Promise<void> {
  assertAttachmentLiveValidationTarget();
  const pgConfig = buildPgFoundationConfig();
  const pool = createPgPoolManager(pgConfig);
  const storageConfig = buildAttachmentStorageConfig();
  const storage = createSupabaseAttachmentStorageAdapter(storageConfig);
  const attachmentService = createAttachmentService(pool, storage);
  const applicationUsers = createApplicationUserService(createApplicationUserRepository(pool));
  const authorization = createAuthorizationService(createAuthorizationRepository(pool));

  const validationId = crypto.randomUUID();
  const patientId = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  const patientCode = `P-VALIDATION-${validationId.slice(0, 8).toUpperCase()}`;
  const bytes = new TextEncoder().encode("%PDF-1.7 fictional Phase 10 validation\n");

  let stage = "bucket verification";
  try {
    console.log(`[attachments] Validation stage: ${stage}`);
    await storage.ensurePrivateBucket();

    stage = "owner and authorization lookup";
    console.log(`[attachments] Validation stage: ${stage}`);
    const ownerResult = await pool.query<{
      id: string;
      auth_user_id: string;
      branch_id: string;
    }>(
      `SELECT u.id, u.auth_user_id, ub.branch_id
       FROM app_users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id AND r.code = 'DENTIST'
       JOIN user_branches ub ON ub.user_id = u.id
       WHERE u.status = 'active' AND u.auth_user_id IS NOT NULL
       ORDER BY u.created_at ASC, ub.assigned_at ASC
       LIMIT 1`
    );
    const owner = ownerResult.rows[0];
    if (!owner) throw new Error("No active Dentist with a branch assignment is available for live validation.");

    const appUser = await applicationUsers.resolveByAuthUserId(owner.auth_user_id);
    const authz = await authorization.resolveContext(appUser);
    authorization.requireBranchPermission(authz, "attachment.create", owner.branch_id);
    try {
      authorization.requireBranchPermission(authz, "attachment.create", crypto.randomUUID());
      throw new Error("Cross-branch attachment authorization unexpectedly succeeded.");
    } catch (error) {
      if (!(error instanceof Error) || error.message === "Cross-branch attachment authorization unexpectedly succeeded.") {
        throw error;
      }
    }

    const roleLeak = await pool.query<{ role_code: string }>(
      `SELECT DISTINCT r.code AS role_code
       FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE p.code LIKE 'attachment.%'
         AND r.code IN ('CLINIC_ADMINISTRATOR', 'SYSTEM_ADMINISTRATOR', 'PATIENT')`
    );
    if (roleLeak.rows.length) throw new Error("A restricted role unexpectedly has attachment permission.");

    stage = "fictional patient setup";
    console.log(`[attachments] Validation stage: ${stage}`);
    await pool.query(
      `INSERT INTO patients (
         id, patient_code, branch_id, date_registered, last_name, first_name,
         birthday, gender, mobile_number, discount_eligibility, created_at, updated_at
       ) VALUES ($1, $2, $3, CURRENT_DATE, 'Validation', 'Fictional',
                 '2000-01-01', 'Other', '0000000000', 'None', NOW(), NOW())`,
      [patientId, patientCode, owner.branch_id]
    );

    const actor = {
      userId: owner.id,
      authUserId: owner.auth_user_id,
      requestId
    };

    stage = "upload intent";
    console.log(`[attachments] Validation stage: ${stage}`);
    const intent = await attachmentService.createUploadIntent({
      patientId,
      treatmentId: null,
      branchId: owner.branch_id,
      category: "Phase 10 Validation",
      originalFilename: "fictional-validation.pdf",
      mimeType: "application/pdf",
      sizeBytes: bytes.length,
      description: "Fictional non-sensitive validation file"
    }, actor);

    stage = "signed upload transfer";
    console.log(`[attachments] Validation stage: ${stage}`);
    const uploadResponse = await fetch(intent.upload.signedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/pdf",
        "x-upsert": "false"
      },
      body: bytes
    });
    if (!uploadResponse.ok) {
      throw new Error(`Signed private upload failed with HTTP ${uploadResponse.status}.`);
    }

    stage = "completion verification";
    console.log(`[attachments] Validation stage: ${stage}`);
    const completed = await attachmentService.complete(intent.attachment.id, actor);
    if (completed.status !== "uploaded" || !completed.checksumSha256) {
      throw new Error("Attachment completion did not persist the validated checksum.");
    }

    stage = "signed download issuance";
    console.log(`[attachments] Validation stage: ${stage}`);
    const download = await attachmentService.createDownloadUrl(intent.attachment.id, actor);
    if (download.expiresInSeconds < 30 || download.expiresInSeconds > 900) {
      throw new Error("Signed download TTL is outside the approved bound.");
    }

    stage = "signed download transfer";
    console.log(`[attachments] Validation stage: ${stage}`);
    const downloadResponse = await fetch(download.signedUrl);
    if (!downloadResponse.ok) throw new Error("Signed private download could not be read.");
    const downloaded = new Uint8Array(await downloadResponse.arrayBuffer());
    if (!Buffer.from(downloaded).equals(Buffer.from(bytes))) {
      throw new Error("Signed private download content did not match the fictional upload.");
    }

    stage = "private object deletion";
    console.log(`[attachments] Validation stage: ${stage}`);
    await attachmentService.deleteAttachment(intent.attachment.id, actor);

    const stored = await pool.query<{
      status: string;
      checksum_sha256: string | null;
      object_key: string;
    }>(
      `SELECT status, checksum_sha256, object_key
       FROM attachments
       WHERE id = $1`,
      [intent.attachment.id]
    );
    if (stored.rows[0]?.status !== "deleted" || !stored.rows[0]?.checksum_sha256) {
      throw new Error("Soft-deleted attachment metadata was not preserved.");
    }
    if (/fictional|validation|patient/i.test(stored.rows[0]?.object_key ?? "")) {
      throw new Error("Private object key contains descriptive or patient-shaped text.");
    }

    const audit = await pool.query<{ action: string; request_id: string | null }>(
      `SELECT action, request_id
       FROM audit_events
       WHERE target_id = $1
       ORDER BY occurred_at ASC, id ASC`,
      [intent.attachment.id]
    );
    const actions = audit.rows.map((row) => row.action);
    for (const expected of [
      "ATTACHMENT_UPLOADED",
      "ATTACHMENT_DOWNLOAD_URL_ISSUED",
      "ATTACHMENT_DELETED"
    ]) {
      if (!actions.includes(expected)) throw new Error(`Missing live audit event: ${expected}`);
    }
    if (audit.rows.some((row) => row.request_id !== requestId)) {
      throw new Error("Live attachment audit request correlation is inconsistent.");
    }

    console.log("[attachments] Live fictional validation passed.");
    console.log(`[attachments] Attachment ID: ${intent.attachment.id}`);
    console.log(`[attachments] Final status: ${stored.rows[0]?.status}`);
  } catch (error) {
    console.error(`[attachments] Live validation failed at stage: ${stage}`);
    throw error;
  } finally {
    await pool.shutdown();
  }
}

const isDirectExecution = process.argv[1]?.endsWith("attachmentLiveValidationCli.ts") === true;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(`[attachments] Live validation failed: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  });
}
