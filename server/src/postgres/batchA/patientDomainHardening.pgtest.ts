import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgPoolManager, PgQueryExecutor } from "../pool.js";
import { createPatientDomainService } from "../../services/patientDomainService.js";
import { PatientDomainError } from "../../services/patientDomainErrors.js";

function emptyResult<R extends QueryResultRow>(): QueryResult<R> {
  return {
    command: "SELECT",
    rowCount: 0,
    oid: 0,
    fields: [],
    rows: []
  };
}

function createPool(queryImpl?: PgQueryExecutor["query"]): { pool: PgPoolManager; calls: string[] } {
  const calls: string[] = [];
  const executor: PgQueryExecutor = {
    async query<R extends QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<R>> {
      calls.push(`${text}|${JSON.stringify(values ?? [])}`);
      if (queryImpl) return queryImpl<R>(text, values);
      return emptyResult<R>();
    }
  };

  const pool: PgPoolManager = {
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
    shutdown: async () => {},
    query: executor.query,
    async withTransaction<T>(callback: (transactionExecutor: PgQueryExecutor) => Promise<T>): Promise<T> {
      return callback(executor);
    }
  };

  return { pool, calls };
}

test("Patient domain rejects malformed UUID before PostgreSQL access", async () => {
  const { pool, calls } = createPool();
  const service = createPatientDomainService(pool);

  await assert.rejects(
    service.getPatientById("not-a-uuid"),
    (error) => error instanceof PatientDomainError && error.code === "INVALID_IDENTITY"
  );
  assert.deepEqual(calls, []);
});

test("Patient domain rejects malformed patient code before PostgreSQL access", async () => {
  const { pool, calls } = createPool();
  const service = createPatientDomainService(pool);

  await assert.rejects(
    service.getPatientByCode("P-26-1"),
    (error) => error instanceof PatientDomainError && error.code === "INVALID_IDENTITY"
  );
  assert.deepEqual(calls, []);
});

test("Patient domain converts missing records to a typed not-found error", async () => {
  const { pool, calls } = createPool();
  const service = createPatientDomainService(pool);

  await assert.rejects(
    service.getPatientById("22222222-2222-4222-8222-222222222222"),
    (error) => error instanceof PatientDomainError && error.code === "NOT_FOUND"
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0] ?? "", /SELECT \* FROM patients WHERE id = \$1/);
});

test("Patient domain hides database-driver details behind a safe persistence error", async () => {
  const { pool } = createPool(async () => {
    throw new Error("postgresql://secret-user:secret-password@example.invalid/private_database");
  });
  const service = createPatientDomainService(pool);

  await assert.rejects(
    service.getPatientByCode("P-2026-0001"),
    (error) =>
      error instanceof PatientDomainError &&
      error.code === "PERSISTENCE_ERROR" &&
      error.message === "Patient data could not be processed." &&
      !error.message.includes("secret")
  );
});
