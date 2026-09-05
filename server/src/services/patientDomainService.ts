import type { PgPoolManager } from "../postgres/pool.js";
import { createPatientReadRepository } from "../repositories/patientRepository.js";
import { PatientDomainError } from "./patientDomainErrors.js";
import { createPatientReadService } from "./patientReadService.js";
import { createPatientWriteService } from "./patientWriteService.js";
import type { PatientWriteInput } from "./patientWriteRules.js";

export function createPatientDomainService(pool: PgPoolManager) {
  const readService = createPatientReadService(createPatientReadRepository(pool));
  const writeService = createPatientWriteService(pool);

  return {
    listPatients() {
      return readService.listPatients();
    },
    searchPatients(query: string) {
      return readService.searchPatients(query);
    },
    async getPatientById(patientId: string) {
      const patient = await readService.getPatientById(patientId);
      if (!patient) throw new PatientDomainError("NOT_FOUND");
      return patient;
    },
    async getPatientByCode(patientCode: string) {
      const patient = await readService.getPatientByCode(patientCode);
      if (!patient) throw new PatientDomainError("NOT_FOUND");
      return patient;
    },
    createPatient(input: PatientWriteInput, now?: Date) {
      return writeService.createPatient(input, now);
    },
    async updatePatient(patientId: string, input: PatientWriteInput, now?: Date) {
      const patient = await writeService.updatePatient(patientId, input, now);
      if (!patient) throw new PatientDomainError("NOT_FOUND");
      return patient;
    }
  };
}
