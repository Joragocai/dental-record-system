import type { NewPatientRecord } from "../postgres/batchA/patients.js";
import type { PatientReadRepository } from "../repositories/patientRepository.js";

export interface PatientReadService {
  listPatients(): Promise<NewPatientRecord[]>;
  searchPatients(query: string): Promise<NewPatientRecord[]>;
  getPatientById(patientId: string): Promise<NewPatientRecord | null>;
  getPatientByCode(patientCode: string): Promise<NewPatientRecord | null>;
}

export function createPatientReadService(repository: PatientReadRepository): PatientReadService {
  return {
    listPatients() {
      return repository.list();
    },
    searchPatients(query: string) {
      return repository.search(query);
    },
    getPatientById(patientId: string) {
      return repository.getById(patientId);
    },
    getPatientByCode(patientCode: string) {
      return repository.getByCode(patientCode);
    }
  };
}
