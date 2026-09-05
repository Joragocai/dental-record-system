import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResultRow } from "pg";
import type { PgPoolManager, PgQueryExecutor } from "../pool.js";
import { createPatientRepository, type PatientRepository } from "../../repositories/patientRepository.js";
import {
  createPatientWriteService,
  PatientWriteValidationError,
  type PatientRepositoryFactory
} from "../../services/patientWriteService.js";
import {
  validateAndNormalizePatientWriteInput,
  type PatientWriteInput
} from "../../services/patientWriteRules.js";
import { buildFictionalLegacyPatientRow, fictionalBranch, fictionalBranchMappings } from "./patientFixtures.js";
import { mapLegacyPatientToDraft } from "./patientMigration.js";
import type { NewPatientRecord } from "./patients.js";

interface RecordedQuery {
  text: string;
  values: readonly unknown[];
}

function buildPatient(): NewPatientRecord {
  return mapLegacyPatientToDraft(
    buildFictionalLegacyPatientRow(),
    fictionalBranchMappings,
    "22222222-2222-4222-8222-222222222222"
  ).patient;
}

function buildWriteInput(overrides: Partial<PatientWriteInput> = {}): PatientWriteInput {
  const patient = buildPatient();
  const {
    id: _id,
    patientCode: _patientCode,
    age: _age,
    medicalAlertSummary: _medicalAlertSummary,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...input
  } = patient;
  return { ...input, ...overrides };
}

function createFakePool(log: string[]): PgPoolManager {
  const executor: PgQueryExecutor = {
    async query<R extends QueryResultRow>(): Promise<never> {
      throw new Error("Unexpected direct query in Patient write service unit test.");
    }
  };

  return {
    describeTarget() {
      return {
        appEnv: "test",
        host: "localhost",
        port: 5432,
        database: "dental_record_system_test",
        username: "dental_app",
        sslMode: "disable"
      };
    },
    isStarted() {
      return true;
    },
    async shutdown() {},
    async query<R extends QueryResultRow>(): Promise<never> {
      throw new Error("Unexpected pool query in Patient write service unit test.");
    },
    async withTransaction<T>(callback: (executor: PgQueryExecutor) => Promise<T>): Promise<T> {
      log.push("begin");
      try {
        const result = await callback(executor);
        log.push("commit");
        return result;
      } catch (error) {
        log.push("rollback");
        throw error;
      }
    }
  };
}

function createRepository(overrides: Partial<PatientRepository> = {}): PatientRepository {
  const patient = buildPatient();
  return {
    async list() {
      return [patient];
    },
    async search() {
      return [patient];
    },
    async getById() {
      return patient;
    },
    async getByCode() {
      return null;
    },
    async branchExists() {
      return true;
    },
    async allocateCode() {
      return { calendarYear: 2026, sequence: 8, patientCode: "P-2026-0008" };
    },
    async insert(record) {
      return record;
    },
    async update(record) {
      return record;
    },
    ...overrides
  };
}

function createRepositoryFactory(repository: PatientRepository): PatientRepositoryFactory {
  return () => repository;
}

test("Patient V2 write rules normalize blanks, derive age, clear non-PWD disability, and derive alerts", () => {
  const result = validateAndNormalizePatientWriteInput(
    buildWriteInput({
      middleName: "   ",
      emailAddress: "   ",
      discountEligibility: "Senior Citizen",
      disabilityType: "Should clear",
      allergyPenicillin: "Yes",
      condition_asthma: true,
      birthday: "1992-03-14"
    }),
    new Date("2026-08-17T12:00:00.000Z")
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.data.middleName, null);
  assert.equal(result.data.emailAddress, null);
  assert.equal(result.data.disabilityType, null);
  assert.equal(result.data.age, 34);
  assert.match(result.data.medicalAlertSummary || "", /Asthma/);
  assert.match(result.data.medicalAlertSummary || "", /Penicillin \/ Antibiotics/);
  assert.match(result.data.medicalAlertSummary || "", /Patient classification: Senior Citizen/);
});

test("Patient V2 write rules preserve applicable V1 validation requirements", () => {
  const result = validateAndNormalizePatientWriteInput(
    buildWriteInput({
      dateRegistered: "2026-08-18",
      birthday: "2026-08-18",
      mobileNumber: "bad",
      emailAddress: "bad-email",
      isMinor: "Yes",
      parentGuardianName: null,
      underMedicalTreatment: "Yes",
      medicalTreatmentDetails: null,
      allergyOthers: "Yes",
      allergyOthersDetails: null
    }),
    new Date("2026-08-17T12:00:00.000Z")
  );

  assert.ok(result.errors.includes("Date Registered cannot be in the future."));
  assert.ok(result.errors.includes("Birthday cannot be in the future."));
  assert.ok(result.errors.includes("Mobile Number format is not valid."));
  assert.ok(result.errors.includes("Email Address is not valid."));
  assert.ok(result.errors.includes("Parent/Guardian Name is required when Is Minor is Yes."));
  assert.ok(result.errors.includes("Medical Treatment Details are required."));
  assert.ok(result.errors.includes("Allergy Others Details are required."));
});

test("Patient V2 create allocates code and inserts inside one transaction", async () => {
  const log: string[] = [];
  const calls: string[] = [];
  const repository = createRepository({
    async branchExists(branchId) {
      calls.push(`branch:${branchId}`);
      return true;
    },
    async allocateCode(allocationDate) {
      calls.push(`allocate:${allocationDate.toISOString()}`);
      return { calendarYear: 2026, sequence: 8, patientCode: "P-2026-0008" };
    },
    async getByCode(patientCode) {
      calls.push(`code:${patientCode}`);
      return null;
    },
    async insert(record) {
      calls.push(`insert:${record.patientCode}`);
      return record;
    }
  });
  const service = createPatientWriteService(createFakePool(log), createRepositoryFactory(repository));
  const now = new Date("2026-08-17T12:00:00.000Z");

  const created = await service.createPatient(buildWriteInput(), now);

  assert.equal(created.patientCode, "P-2026-0008");
  assert.match(created.id, /^[0-9a-f-]{36}$/i);
  assert.equal(created.createdAt, now.toISOString());
  assert.equal(created.updatedAt, now.toISOString());
  assert.equal(created.branchId, fictionalBranch.id);
  assert.deepEqual(log, ["begin", "commit"]);
  assert.deepEqual(calls, [
    `branch:${fictionalBranch.id}`,
    `allocate:${now.toISOString()}`,
    "code:P-2026-0008",
    "insert:P-2026-0008"
  ]);
});

test("Patient V2 create rejects a missing branch before code allocation", async () => {
  const log: string[] = [];
  let allocationCalled = false;
  const repository = createRepository({
    async branchExists() {
      return false;
    },
    async allocateCode() {
      allocationCalled = true;
      return { calendarYear: 2026, sequence: 8, patientCode: "P-2026-0008" };
    }
  });
  const service = createPatientWriteService(createFakePool(log), createRepositoryFactory(repository));

  await assert.rejects(
    service.createPatient(buildWriteInput(), new Date("2026-08-17T12:00:00.000Z")),
    (error) => error instanceof PatientWriteValidationError && error.errors.includes("Branch does not exist.")
  );
  assert.equal(allocationCalled, false);
  assert.deepEqual(log, ["begin", "rollback"]);
});

test("Patient V2 create rolls back when persistence fails after code allocation", async () => {
  const log: string[] = [];
  const repository = createRepository({
    async insert() {
      throw new Error("fictional insert failure");
    }
  });
  const service = createPatientWriteService(createFakePool(log), createRepositoryFactory(repository));

  await assert.rejects(
    service.createPatient(buildWriteInput(), new Date("2026-08-17T12:00:00.000Z")),
    /fictional insert failure/
  );
  assert.deepEqual(log, ["begin", "rollback"]);
});

test("Patient V2 create rejects a code conflict within the same transaction", async () => {
  const log: string[] = [];
  let insertCalled = false;
  const repository = createRepository({
    async getByCode() {
      return buildPatient();
    },
    async insert(record) {
      insertCalled = true;
      return record;
    }
  });
  const service = createPatientWriteService(createFakePool(log), createRepositoryFactory(repository));

  await assert.rejects(
    service.createPatient(buildWriteInput(), new Date("2026-08-17T12:00:00.000Z")),
    /Patient code conflict: P-2026-0008 already exists/
  );
  assert.equal(insertCalled, false);
  assert.deepEqual(log, ["begin", "rollback"]);
});

test("Patient V2 update preserves UUID, patient code, and created timestamp", async () => {
  const log: string[] = [];
  const existing = buildPatient();
  let allocationCalled = false;
  const repository = createRepository({
    async getById(patientId) {
      assert.equal(patientId, existing.id);
      return existing;
    },
    async allocateCode() {
      allocationCalled = true;
      return { calendarYear: 2026, sequence: 9, patientCode: "P-2026-0009" };
    },
    async update(record) {
      return record;
    }
  });
  const service = createPatientWriteService(createFakePool(log), createRepositoryFactory(repository));
  const now = new Date("2026-08-18T12:00:00.000Z");

  const result = await service.updatePatient(
    existing.id,
    buildWriteInput({ firstName: "Updated", mobileNumber: "09998887777" }),
    now
  );

  assert.ok(result);
  assert.equal(result.id, existing.id);
  assert.equal(result.patientCode, existing.patientCode);
  assert.equal(result.createdAt, existing.createdAt);
  assert.equal(result.updatedAt, now.toISOString());
  assert.equal(result.firstName, "Updated");
  assert.equal(result.mobileNumber, "09998887777");
  assert.equal(allocationCalled, false);
  assert.deepEqual(log, ["begin", "commit"]);
});

test("Patient V2 update rejects malformed UUID before starting a transaction", async () => {
  const log: string[] = [];
  const service = createPatientWriteService(createFakePool(log), createRepositoryFactory(createRepository()));

  await assert.rejects(
    service.updatePatient("not-a-uuid", buildWriteInput(), new Date("2026-08-17T12:00:00.000Z")),
    (error) => error instanceof PatientWriteValidationError && error.errors.includes("Patient ID must be a valid UUID.")
  );
  assert.deepEqual(log, []);
});

test("Patient PostgreSQL update query never mutates UUID, patient code, or created timestamp", async () => {
  const recorded: RecordedQuery[] = [];
  const executor: PgQueryExecutor = {
    async query<R extends QueryResultRow>(text: string, values?: readonly unknown[]) {
      recorded.push({ text, values: values ?? [] });
      return {
        command: "UPDATE",
        rowCount: 0,
        oid: 0,
        fields: [],
        rows: []
      };
    }
  };
  const repository = createPatientRepository(executor);
  const result = await repository.update(buildPatient());

  assert.equal(result, null);
  assert.equal(recorded.length, 1);
  assert.match(recorded[0]?.text ?? "", /^UPDATE patients/);
  assert.doesNotMatch(recorded[0]?.text ?? "", /(?:SET|,)\s+id\s*=/);
  assert.doesNotMatch(recorded[0]?.text ?? "", /patient_code\s*=/);
  assert.doesNotMatch(recorded[0]?.text ?? "", /created_at\s*=/);
  assert.match(recorded[0]?.text ?? "", /updated_at\s*=\s*\$\d+/);
  assert.equal(recorded[0]?.values.at(-1), buildPatient().id);
});
