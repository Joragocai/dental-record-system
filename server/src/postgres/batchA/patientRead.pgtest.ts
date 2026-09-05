import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResultRow } from "pg";
import type { PgQueryExecutor } from "../pool.js";
import { createPatientReadRepository } from "../../repositories/patientRepository.js";
import { createPatientReadService } from "../../services/patientReadService.js";
import { buildFictionalLegacyPatientRow, fictionalBranchMappings } from "./patientFixtures.js";
import { mapLegacyPatientToDraft } from "./patientMigration.js";
import type { NewPatientRecord } from "./patients.js";

interface RecordedQuery {
  text: string;
  values: readonly unknown[];
}

function createRecordingExecutor(recorded: RecordedQuery[]): PgQueryExecutor {
  return {
    async query<R extends QueryResultRow>(text: string, values?: readonly unknown[]) {
      recorded.push({ text, values: values ?? [] });
      return {
        command: "SELECT",
        rowCount: 0,
        oid: 0,
        fields: [],
        rows: []
      };
    }
  };
}

function buildPatient(): NewPatientRecord {
  return mapLegacyPatientToDraft(
    buildFictionalLegacyPatientRow(),
    fictionalBranchMappings,
    "22222222-2222-4222-8222-222222222222"
  ).patient;
}

test("Patient PostgreSQL read repository preserves V1 list ordering contract", async () => {
  const recorded: RecordedQuery[] = [];
  const repository = createPatientReadRepository(createRecordingExecutor(recorded));

  assert.deepEqual(await repository.list(), []);
  assert.equal(recorded.length, 1);
  assert.match(
    recorded[0]?.text ?? "",
    /ORDER BY last_name ASC, first_name ASC, middle_name ASC NULLS FIRST, patient_code ASC/
  );
  assert.deepEqual(recorded[0]?.values, []);
});

test("Patient PostgreSQL read repository searches the same V1 patient criteria with a parameterized value", async () => {
  const recorded: RecordedQuery[] = [];
  const repository = createPatientReadRepository(createRecordingExecutor(recorded));

  assert.deepEqual(await repository.search("  Pat  "), []);
  assert.equal(recorded.length, 1);
  assert.match(recorded[0]?.text ?? "", /last_name ILIKE \$1/);
  assert.match(recorded[0]?.text ?? "", /first_name ILIKE \$1/);
  assert.match(recorded[0]?.text ?? "", /patient_code ILIKE \$1/);
  assert.match(recorded[0]?.text ?? "", /mobile_number ILIKE \$1/);
  assert.deepEqual(recorded[0]?.values, ["%Pat%"]);
});

test("Patient PostgreSQL read repository treats blank search as the deterministic list path", async () => {
  const recorded: RecordedQuery[] = [];
  const repository = createPatientReadRepository(createRecordingExecutor(recorded));

  assert.deepEqual(await repository.search("   "), []);
  assert.equal(recorded.length, 1);
  assert.match(recorded[0]?.text ?? "", /^SELECT \* FROM patients ORDER BY/);
  assert.deepEqual(recorded[0]?.values, []);
});

test("Patient read service keeps repository concerns behind a typed runtime boundary", async () => {
  const patient = buildPatient();
  const calls: string[] = [];
  const service = createPatientReadService({
    async list() {
      calls.push("list");
      return [patient];
    },
    async search(query) {
      calls.push(`search:${query}`);
      return [patient];
    },
    async getById(patientId) {
      calls.push(`id:${patientId}`);
      return patient;
    },
    async getByCode(patientCode) {
      calls.push(`code:${patientCode}`);
      return patient;
    }
  });

  assert.deepEqual(await service.listPatients(), [patient]);
  assert.deepEqual(await service.searchPatients("Example"), [patient]);
  assert.equal(await service.getPatientById(patient.id), patient);
  assert.equal(await service.getPatientByCode(patient.patientCode), patient);
  assert.deepEqual(calls, ["list", "search:Example", `id:${patient.id}`, `code:${patient.patientCode}`]);
});
