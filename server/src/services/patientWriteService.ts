import crypto from "node:crypto";
import type { PgPoolManager, PgQueryExecutor } from "../postgres/pool.js";
import { createPatientRepository, type PatientRepository } from "../repositories/patientRepository.js";
import type { NewPatientRecord } from "../postgres/batchA/patients.js";
import {
  validateAndNormalizePatientWriteInput,
  type PatientWriteInput,
  type PatientWriteValidationResult
} from "./patientWriteRules.js";
import { PatientDomainError, toPatientPersistenceError } from "./patientDomainErrors.js";
import { normalizePatientId } from "./patientIdentity.js";

export class PatientWriteValidationError extends PatientDomainError {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super("INVALID_INPUT", errors);
    this.name = "PatientWriteValidationError";
    this.errors = [...errors];
  }
}

export interface PatientWriteService {
  createPatient(input: PatientWriteInput, now?: Date): Promise<NewPatientRecord>;
  updatePatient(patientId: string, input: PatientWriteInput, now?: Date): Promise<NewPatientRecord | null>;
}

function assertValidInput(result: PatientWriteValidationResult): void {
  if (result.errors.length) {
    throw new PatientWriteValidationError(result.errors);
  }
}

export type PatientRepositoryFactory = (executor: PgQueryExecutor) => PatientRepository;

export function createPatientWriteService(
  pool: PgPoolManager,
  repositoryFactory: PatientRepositoryFactory = createPatientRepository
): PatientWriteService {
  return {
    async createPatient(input: PatientWriteInput, now = new Date()): Promise<NewPatientRecord> {
      const validation = validateAndNormalizePatientWriteInput(input, now);
      assertValidInput(validation);
      const timestamp = now.toISOString();

      try {
        return await pool.withTransaction(async (executor) => {
          const repository = repositoryFactory(executor);
          if (!(await repository.branchExists(validation.data.branchId))) {
            throw new PatientDomainError("BRANCH_NOT_FOUND");
          }

          const allocation = await repository.allocateCode(now);
          if (await repository.getByCode(allocation.patientCode)) {
            throw new PatientDomainError("CODE_CONFLICT");
          }

          const patient: NewPatientRecord = {
            ...validation.data,
            id: crypto.randomUUID(),
            patientCode: allocation.patientCode,
            createdAt: timestamp,
            updatedAt: timestamp
          };

          return repository.insert(patient);
        });
      } catch (error) {
        throw toPatientPersistenceError(error);
      }
    },

    async updatePatient(patientId: string, input: PatientWriteInput, now = new Date()): Promise<NewPatientRecord | null> {
      const normalizedPatientId = normalizePatientId(patientId);
      const validation = validateAndNormalizePatientWriteInput(input, now);
      assertValidInput(validation);
      const timestamp = now.toISOString();

      try {
        return await pool.withTransaction(async (executor) => {
          const repository = repositoryFactory(executor);
          const existing = await repository.getById(normalizedPatientId);
          if (!existing) return null;

          if (!(await repository.branchExists(validation.data.branchId))) {
            throw new PatientDomainError("BRANCH_NOT_FOUND");
          }

          const patient: NewPatientRecord = {
            ...existing,
            ...validation.data,
            id: existing.id,
            patientCode: existing.patientCode,
            createdAt: existing.createdAt,
            updatedAt: timestamp
          };

          return repository.update(patient);
        });
      } catch (error) {
        throw toPatientPersistenceError(error);
      }
    }
  };
}
