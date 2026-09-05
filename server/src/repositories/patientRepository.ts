import type { PgQueryExecutor } from "../postgres/pool.js";
import {
  getPatientByCode,
  getPatientById,
  listPatients,
  searchPatients,
  type NewPatientRecord
} from "../postgres/batchA/patients.js";

export interface PatientReadRepository {
  list(): Promise<NewPatientRecord[]>;
  search(query: string): Promise<NewPatientRecord[]>;
  getById(patientId: string): Promise<NewPatientRecord | null>;
  getByCode(patientCode: string): Promise<NewPatientRecord | null>;
}

export function createPatientReadRepository(executor: PgQueryExecutor): PatientReadRepository {
  return {
    list() {
      return listPatients(executor);
    },
    search(query: string) {
      return searchPatients(executor, query);
    },
    getById(patientId: string) {
      return getPatientById(executor, patientId);
    },
    getByCode(patientCode: string) {
      return getPatientByCode(executor, patientCode);
    }
  };
}
