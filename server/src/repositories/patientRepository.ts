import type { PgQueryExecutor } from "../postgres/pool.js";
import { getBranchById } from "../postgres/batchA/branches.js";
import { allocateAnnualPatientCode, type AllocatePatientCodeResult } from "../postgres/batchA/patientCodeAllocation.js";
import {
  getPatientByCode,
  getPatientById,
  insertPatient,
  listPatients,
  searchPatients,
  updatePatient,
  type NewPatientRecord
} from "../postgres/batchA/patients.js";

export interface PatientReadRepository {
  list(): Promise<NewPatientRecord[]>;
  search(query: string): Promise<NewPatientRecord[]>;
  getById(patientId: string): Promise<NewPatientRecord | null>;
  getByCode(patientCode: string): Promise<NewPatientRecord | null>;
}

export interface PatientWriteRepository {
  branchExists(branchId: string): Promise<boolean>;
  allocateCode(allocationDate: Date): Promise<AllocatePatientCodeResult>;
  insert(patient: NewPatientRecord): Promise<NewPatientRecord>;
  update(patient: NewPatientRecord): Promise<NewPatientRecord | null>;
}

export type PatientRepository = PatientReadRepository & PatientWriteRepository;

export function createPatientRepository(executor: PgQueryExecutor): PatientRepository {
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
    },
    async branchExists(branchId: string) {
      return (await getBranchById(executor, branchId)) !== null;
    },
    allocateCode(allocationDate: Date) {
      return allocateAnnualPatientCode(executor, allocationDate);
    },
    insert(patient: NewPatientRecord) {
      return insertPatient(executor, patient);
    },
    update(patient: NewPatientRecord) {
      return updatePatient(executor, patient);
    }
  };
}

export function createPatientReadRepository(executor: PgQueryExecutor): PatientReadRepository {
  return createPatientRepository(executor);
}
