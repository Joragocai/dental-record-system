import type { PgQueryExecutor } from "../postgres/pool.js";

export interface PatientProvisioningTarget {
  id: string;
  email: string;
  patientEmail: string | null;
  patientBranchId: string;
  approvedByUserId: string;
  authUserId: string | null;
  userStatus: string;
  linkStatus: string;
  invitationState: string;
  roles: string[];
  branchIds: string[];
}

export function createPatientProvisioningRepository(db: PgQueryExecutor) {
  async function getById(id: string): Promise<PatientProvisioningTarget | null> {
    const result = await db.query<{
      id: string; email: string; patient_email: string | null; patient_branch_id: string;
      approved_by_user_id: string; auth_user_id: string | null;
      user_status: string; link_status: string; invitation_state: string;
    }>(
      `SELECT u.id, u.email, u.auth_user_id, u.status AS user_status,
              pa.status AS link_status, pa.invitation_state,
              pa.approved_by_user_id, p.email_address AS patient_email,
              p.branch_id AS patient_branch_id
       FROM app_users u
       JOIN patient_accounts pa ON pa.app_user_id = u.id
       JOIN patients p ON p.id = pa.patient_id
       WHERE u.id = $1`,
      [id]
    );
    const row = result.rows[0];
    if (!row) return null;

    const [roles, branches] = await Promise.all([
      db.query<{ code: string }>(
        "SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1",
        [id]
      ),
      db.query<{ branch_id: string }>("SELECT branch_id FROM user_branches WHERE user_id = $1", [id])
    ]);
    return {
      id: row.id, email: row.email, patientEmail: row.patient_email,
      patientBranchId: row.patient_branch_id, approvedByUserId: row.approved_by_user_id,
      authUserId: row.auth_user_id, userStatus: row.user_status, linkStatus: row.link_status,
      invitationState: row.invitation_state, roles: roles.rows.map((r) => r.code),
      branchIds: branches.rows.map((b) => b.branch_id)
    };
  }

  return {
    getById,
    async getByAuthId(id: string): Promise<PatientProvisioningTarget | null> {
      const result = await db.query<{ id: string }>(
        "SELECT u.id FROM app_users u JOIN patient_accounts pa ON pa.app_user_id = u.id WHERE u.auth_user_id = $1",
        [id]
      );
      return result.rows[0] ? getById(result.rows[0].id) : null;
    },
    async claimInvitation(id: string): Promise<boolean> {
      const result = await db.query(
        `UPDATE patient_accounts pa
         SET invitation_state = 'sending', invitation_started_at = NOW(), updated_at = NOW()
         FROM app_users u, patients p
         WHERE pa.app_user_id = $1 AND u.id = $1 AND p.id = pa.patient_id
           AND pa.status = 'pending' AND pa.invitation_state = 'not_sent'
           AND u.status = 'pending' AND u.auth_user_id IS NULL
           AND p.email_address IS NOT NULL
           AND lower(trim(p.email_address)) = lower(trim(u.email))
           AND EXISTS (
             SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = u.id AND r.code = 'PATIENT'
           )
           AND NOT EXISTS (
             SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = u.id AND r.code <> 'PATIENT'
           )
           AND NOT EXISTS (SELECT 1 FROM user_branches ub WHERE ub.user_id = u.id)`,
        [id]
      );
      return result.rowCount === 1;
    },
    async markReconciliation(id: string): Promise<void> {
      await db.query(
        `UPDATE patient_accounts SET invitation_state = 'reconciliation_required',
          updated_at = NOW()
         WHERE app_user_id = $1 AND invitation_state = 'sending'`,
        [id]
      );
    },
    async markSent(id: string, authId: string): Promise<boolean> {
      const user = await db.query(
        `UPDATE app_users SET auth_user_id = $2, updated_at = NOW()
         WHERE id = $1 AND status = 'pending' AND auth_user_id IS NULL`,
        [id, authId]
      );
      if (user.rowCount !== 1) return false;
      const link = await db.query(
        `UPDATE patient_accounts SET invitation_state = 'sent',
          invited_at = NOW(), updated_at = NOW()
         WHERE app_user_id = $1 AND status = 'pending' AND invitation_state = 'sending'`,
        [id]
      );
      return link.rowCount === 1;
    },
    async activate(id: string, authId: string, email: string): Promise<boolean> {
      const link = await db.query(
        `UPDATE patient_accounts pa
         SET status = 'active', activated_at = NOW(), updated_at = NOW()
         FROM app_users u
         WHERE pa.app_user_id = $1 AND u.id = $1
           AND pa.status = 'pending' AND pa.invitation_state = 'sent'
           AND u.auth_user_id = $2 AND u.status = 'pending'
           AND lower(trim(u.email)) = $3
           AND EXISTS (
             SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = u.id AND r.code = 'PATIENT'
           )
           AND NOT EXISTS (
             SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = u.id AND r.code <> 'PATIENT'
           )
           AND NOT EXISTS (SELECT 1 FROM user_branches ub WHERE ub.user_id = u.id)`,
        [id, authId, email]
      );
      if (link.rowCount !== 1) return false;
      const user = await db.query(
        `UPDATE app_users SET status = 'active', updated_at = NOW()
         WHERE id = $1 AND auth_user_id = $2 AND status = 'pending' AND lower(trim(email)) = $3`,
        [id, authId, email]
      );
      return user.rowCount === 1;
    }
  };
}
