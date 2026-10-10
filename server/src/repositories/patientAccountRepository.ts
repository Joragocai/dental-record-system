import type { PgQueryExecutor } from "../postgres/pool.js";

export interface PatientAccountLink {
  appUserId: string;
  patientId: string;
  status: "pending" | "active" | "revoked";
}

export interface PatientAccountRepository {
  getByUserId(appUserId: string): Promise<PatientAccountLink | null>;
}

export function createPatientAccountRepository(db: PgQueryExecutor): PatientAccountRepository {
  return {
    async getByUserId(appUserId) {
      const result = await db.query<{
        app_user_id: string;
        patient_id: string;
        status: "pending" | "active" | "revoked";
      }>(
        "SELECT app_user_id, patient_id, status FROM patient_accounts WHERE app_user_id = $1",
        [appUserId]
      );
      const link = result.rows[0];
      if (!link) return null;
      if (!["pending", "active", "revoked"].includes(link.status)) {
        throw new Error("Invalid patient ownership state.");
      }
      return { appUserId: link.app_user_id, patientId: link.patient_id, status: link.status };
    }
  };
}
