import type { NewPatientRecord } from "../postgres/batchA/patients.js";
import type { PatientReadRepository } from "../repositories/patientRepository.js";
import { toPatientPersistenceError } from "./patientDomainErrors.js";
import { normalizePatientCode, normalizePatientId } from "./patientIdentity.js";

export interface PatientReadService {
  listPatients(): Promise<NewPatientRecord[]>;
  searchPatients(query: string): Promise<NewPatientRecord[]>;
  getPatientById(patientId: string): Promise<NewPatientRecord | null>;
  getPatientByCode(patientCode: string): Promise<NewPatientRecord | null>;
}

export function createPatientReadService(repository: PatientReadRepository): PatientReadService {
  return {
    async listPatients() {
      try {
        return await repository.list();
      } catch (error) {
        throw toPatientPersistenceError(error);
      }
    },
    async searchPatients(query: string) {
      try {
        return await repository.search(query);
      } catch (error) {
        throw toPatientPersistenceError(error);
      }
    },
    async getPatientById(patientId: string) {
      const normalizedPatientId = normalizePatientId(patientId);
      try {
        return await repository.getById(normalizedPatientId);
      } catch (error) {
        throw toPatientPersistenceError(error);
      }
    },
    async getPatientByCode(patientCode: string) {
      const normalizedPatientCode = normalizePatientCode(patientCode);
      try {
        return await repository.getByCode(normalizedPatientCode);
      } catch (error) {
        throw toPatientPersistenceError(error);
      }
    }
  };
}
