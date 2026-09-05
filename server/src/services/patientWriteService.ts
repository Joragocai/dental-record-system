import crypto from "node:crypto";
import type { PgPoolManager, PgQueryExecutor } from "../postgres/pool.js";
import { createPatientRepository, type PatientRepository } from "../repositories/patientRepository.js";
import type { NewPatientRecord } from "../postgres/batchA/patients.js";
import {
  validateAndNormalizePatientWriteInput,
  type PatientWriteInput,
  type PatientWriteValidationResult
} from "./patientWriteRules.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PatientWriteValidationError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(errors[0] || "Patient data is invalid.");
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

function assertPatientId(patientId: string): string {
  const normalized = String(patientId).trim();
  if (!uuidPattern.test(normalized)) {
    throw new PatientWriteValidationError(["Patient ID must be a valid UUID."]);
  }
  return normalized;
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

      return pool.withTransaction(async (executor) => {
        const repository = repositoryFactory(executor);
        if (!(await repository.branchExists(validation.data.branchId))) {
          throw new PatientWriteValidationError(["Branch does not exist."]);
        }

        const allocation = await repository.allocateCode(now);
        if (await repository.getByCode(allocation.patientCode)) {
          throw new Error(`Patient code conflict: ${allocation.patientCode} already exists.`);
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
    },

    async updatePatient(patientId: string, input: PatientWriteInput, now = new Date()): Promise<NewPatientRecord | null> {
      const normalizedPatientId = assertPatientId(patientId);
      const validation = validateAndNormalizePatientWriteInput(input, now);
      assertValidInput(validation);
      const timestamp = now.toISOString();

      return pool.withTransaction(async (executor) => {
        const repository = repositoryFactory(executor);
        const existing = await repository.getById(normalizedPatientId);
        if (!existing) return null;

        if (!(await repository.branchExists(validation.data.branchId))) {
          throw new PatientWriteValidationError(["Branch does not exist."]);
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
    }
  };
}
