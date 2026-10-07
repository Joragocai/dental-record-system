import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgPoolManager, PgQueryExecutor } from "../postgres/pool.js";
import {
  createInitialBranchBootstrapService,
  InitialBranchBootstrapError
} from "./initialBranchBootstrapService.js";

const branchId = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-10-07T13:40:00.000Z");

function result<R extends QueryResultRow>(rows: R[]): QueryResult<R> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

class FakePool implements PgPoolManager {
  branchRows: Array<Record<string, unknown>> = [];
  readonly queries: string[] = [];

  describeTarget() {
    return {
      appEnv: "local" as const,
      host: "localhost",
      port: 5432,
      database: "test",
      username: "test",
      sslMode: "disable" as const
    };
  }

  isStarted() {
    return true;
  }

  async shutdown() {}

  async query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<QueryResult<R>> {
    return this.execute<R>(text, values);
  }

  async withTransaction<T>(callback: (executor: PgQueryExecutor) => Promise<T>): Promise<T> {
    return callback({
      query: <R extends QueryResultRow = QueryResultRow>(text: string, values: readonly unknown[] = []) =>
        this.execute<R>(text, values)
    });
  }

  private async execute<R extends QueryResultRow>(
    text: string,
    values: readonly unknown[]
  ): Promise<QueryResult<R>> {
    const normalized = text.replace(/\s+/g, " ").trim();
    this.queries.push(normalized);

    if (normalized.startsWith("SELECT pg_advisory_xact_lock")) {
      return result([] as R[]);
    }

    if (normalized === "SELECT COUNT(*) AS branch_count FROM branches") {
      return result([{ branch_count: this.branchRows.length }] as unknown as R[]);
    }

    if (normalized.startsWith("INSERT INTO branches")) {
      const row = {
        id: values[0],
        branch_code: values[1],
        branch_name: values[2],
        created_at: values[3],
        updated_at: values[4]
      };
      this.branchRows.push(row);
      return result([row] as unknown as R[]);
    }

    throw new Error(`Unexpected SQL: ${normalized}`);
  }
}

function isBootstrapError(error: unknown, code: InitialBranchBootstrapError["code"]): boolean {
  return error instanceof InitialBranchBootstrapError && error.code === code;
}

test("initial branch bootstrap creates exactly one normalized branch", async () => {
  const pool = new FakePool();
  const service = createInitialBranchBootstrapService(pool, {
    createId: () => branchId,
    now: () => now
  });

  const created = await service.bootstrap({
    branchCode: " main ",
    branchName: " Khurana Calliap Dental Clinic - Main Branch "
  });

  assert.equal(created.id, branchId);
  assert.equal(created.branchCode, "MAIN");
  assert.equal(created.branchName, "Khurana Calliap Dental Clinic - Main Branch");
  assert.equal(pool.branchRows.length, 1);
  assert.equal(pool.queries.some((query) => query.includes("pg_advisory_xact_lock")), true);
});

test("initial branch bootstrap refuses a second branch", async () => {
  const pool = new FakePool();
  const service = createInitialBranchBootstrapService(pool, {
    createId: () => branchId,
    now: () => now
  });

  await service.bootstrap({ branchCode: "MAIN", branchName: "Main Branch" });

  await assert.rejects(
    service.bootstrap({ branchCode: "SECOND", branchName: "Second Branch" }),
    (error) => isBootstrapError(error, "INITIAL_BRANCH_ALREADY_EXISTS")
  );
  assert.equal(pool.branchRows.length, 1);
});

test("initial branch bootstrap rejects invalid branch input before writing", async () => {
  const pool = new FakePool();
  const service = createInitialBranchBootstrapService(pool);

  await assert.rejects(
    service.bootstrap({ branchCode: "not valid!", branchName: "Main Branch" }),
    (error) => isBootstrapError(error, "INITIAL_BRANCH_INPUT_INVALID")
  );
  assert.equal(pool.queries.length, 0);
});
