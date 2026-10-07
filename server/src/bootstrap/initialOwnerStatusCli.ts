import { buildPgFoundationConfig, formatPgTarget } from "../postgres/config.js";
import { createPgPoolManager } from "../postgres/pool.js";
import { buildStaffProvisioningConfig } from "../staff/staffProvisioningConfig.js";

interface OwnerRow {
  id: string;
  auth_user_id: string | null;
  status: string;
  email: string;
  display_name: string;
}

interface TextRow {
  value: string;
}

interface AuditRow {
  action: string;
  outcome: string;
  occurred_at: string | Date;
}

async function main(): Promise<void> {
  const pgConfig = buildPgFoundationConfig();
  const provisioningConfig = buildStaffProvisioningConfig();
  const pool = createPgPoolManager(pgConfig);

  try {
    console.log(`[owner-status] Database target: ${formatPgTarget(pool.describeTarget())}`);

    const ownerResult = await pool.query<OwnerRow>(
      `SELECT u.id, u.auth_user_id, u.status, u.email, u.display_name
       FROM app_users u
       WHERE EXISTS (
         SELECT 1
         FROM user_roles ur
         INNER JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = u.id
           AND r.code = 'CLINIC_ADMINISTRATOR'
       )
       ORDER BY u.created_at ASC, u.id ASC`
    );

    if (ownerResult.rows.length !== 1) {
      console.log(`[owner-status] FAIL expected exactly one Clinic Administrator, found ${ownerResult.rows.length}.`);
      process.exitCode = 1;
      return;
    }

    const owner = ownerResult.rows[0]!;
    console.log(`[owner-status] Owner application user: ${owner.id}`);
    console.log(`[owner-status] Display name: ${owner.display_name}`);
    console.log(`[owner-status] Email: ${owner.email}`);
    console.log(`[owner-status] Status: ${owner.status}`);
    console.log(`[owner-status] Supabase UUID linked: ${owner.auth_user_id ? "yes" : "no"}`);

    const roleResult = await pool.query<TextRow>(
      `SELECT r.code AS value
       FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1
       ORDER BY r.code ASC`,
      [owner.id]
    );
    console.log(`[owner-status] Roles: ${roleResult.rows.map((row) => row.value).join(", ")}`);

    const branchResult = await pool.query<TextRow>(
      `SELECT b.branch_code || ' — ' || b.branch_name AS value
       FROM user_branches ub
       INNER JOIN branches b ON b.id = ub.branch_id
       WHERE ub.user_id = $1
       ORDER BY b.branch_code ASC`,
      [owner.id]
    );
    console.log(`[owner-status] Branches: ${branchResult.rows.map((row) => row.value).join(", ")}`);

    const auditResult = await pool.query<AuditRow>(
      `SELECT action, outcome, occurred_at
       FROM audit_events
       WHERE target_id = $1
       ORDER BY occurred_at ASC`,
      [owner.id]
    );
    console.log("[owner-status] Audit events:");
    for (const event of auditResult.rows) {
      const occurredAt = event.occurred_at instanceof Date ? event.occurred_at.toISOString() : String(event.occurred_at);
      console.log(`  ${event.action} / ${event.outcome} / ${occurredAt}`);
    }

    if (!owner.auth_user_id) {
      console.log("[owner-status] FAIL no Supabase Auth UUID is linked.");
      process.exitCode = 1;
      return;
    }

    const response = await fetch(
      `${provisioningConfig.supabaseUrl}/auth/v1/admin/users/${owner.auth_user_id}`,
      {
        headers: {
          apikey: provisioningConfig.secretKey,
          Authorization: `Bearer ${provisioningConfig.secretKey}`,
          Accept: "application/json"
        }
      }
    );

    console.log(`[owner-status] Supabase Auth user lookup: ${response.ok ? "FOUND" : `FAILED (${response.status})`}`);

    const adminCountResult = await pool.query<{ admin_count: string | number }>(
      `SELECT COUNT(*) AS admin_count
       FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
       WHERE r.code = 'CLINIC_ADMINISTRATOR'`
    );
    const adminCount = Number(adminCountResult.rows[0]?.admin_count ?? 0);
    const bootstrapDisabledOk = adminCount >= 1;
    console.log(`[owner-status] One-time bootstrap disabled condition: ${bootstrapDisabledOk ? "PASS" : "FAIL"}`);

    const expectedRoles = ["CLINIC_ADMINISTRATOR", "DENTIST"];
    const actualRoles = roleResult.rows.map((row) => row.value).sort();
    const rolesOk =
      actualRoles.length === expectedRoles.length &&
      actualRoles.every((role, index) => role === [...expectedRoles].sort()[index]);
    const branchOk = branchResult.rows.length === 1;
    const activeOk = owner.status === "active";
    const supabaseOk = response.ok;

    console.log(`[owner-status] Active owner: ${activeOk ? "PASS" : "FAIL"}`);
    console.log(`[owner-status] Exact owner roles: ${rolesOk ? "PASS" : "FAIL"}`);
    console.log(`[owner-status] One branch assignment: ${branchOk ? "PASS" : "FAIL"}`);
    console.log(`[owner-status] Supabase identity exists: ${supabaseOk ? "PASS" : "FAIL"}`);

    if (!activeOk || !rolesOk || !branchOk || !supabaseOk || !bootstrapDisabledOk) {
      process.exitCode = 1;
    }
  } finally {
    await pool.shutdown();
  }
}

main().catch((error) => {
  console.error(`[owner-status] Failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
