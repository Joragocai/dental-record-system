import assert from "node:assert/strict";
import test from "node:test";
import type { PoolConfig, QueryResult, QueryResultRow } from "pg";
import { buildPgFoundationConfig } from "./config.js";
import { createPgPoolManager, type PgPoolClientLike, type PgPoolLike } from "./pool.js";

function createEmptyResult<R extends QueryResultRow>(): QueryResult<R> {
  return {
    command: "SELECT",
    rowCount: 0,
    oid: 0,
    rows: [],
    fields: []
  };
}

class FakePoolClient implements PgPoolClientLike {
  readonly statements: string[] = [];

  async query<R extends QueryResultRow = QueryResultRow>(
    text: string
  ): Promise<QueryResult<R>> {
    this.statements.push(text);
    return createEmptyResult<R>();
  }

  release(): void {
    // No-op for the fake client.
  }
}

class FakePool implements PgPoolLike {
  static instances: FakePool[] = [];

  readonly client = new FakePoolClient();
  readonly queries: string[] = [];
  ended = false;

  constructor(readonly config: PoolConfig) {
    FakePool.instances.push(this);
  }

  async query<R extends QueryResultRow = QueryResultRow>(text: string): Promise<QueryResult<R>> {
    this.queries.push(text);
    return createEmptyResult<R>();
  }

  async connect(): Promise<PgPoolClientLike> {
    return this.client;
  }

  async end(): Promise<void> {
    this.ended = true;
  }
}

test("createPgPoolManager is lazy and shuts down the created pool", async () => {
  FakePool.instances = [];

  const manager = createPgPoolManager(
    buildPgFoundationConfig({
      DATABASE_URL: "postgresql://clinic_user:secret@127.0.0.1:5432/dental_v2_local"
    }),
    FakePool
  );

  assert.equal(manager.isStarted(), false);
  assert.equal(FakePool.instances.length, 0);

  await manager.query("SELECT 1");

  assert.equal(manager.isStarted(), true);
  assert.equal(FakePool.instances.length, 1);

  await manager.shutdown();

  assert.equal(FakePool.instances[0]?.ended, true);
  assert.equal(manager.isStarted(), false);
});

test("createPgPoolManager wraps work in a transaction with commit", async () => {
  FakePool.instances = [];

  const manager = createPgPoolManager(
    buildPgFoundationConfig({
      DATABASE_URL: "postgresql://clinic_user:secret@127.0.0.1:5432/dental_v2_local"
    }),
    FakePool
  );

  await manager.withTransaction(async (executor) => {
    await executor.query("SELECT 42");
  });

  assert.deepEqual(FakePool.instances[0]?.client.statements, ["BEGIN", "SELECT 42", "COMMIT"]);
});

test("createPgPoolManager rolls back the transaction when the callback fails", async () => {
  FakePool.instances = [];

  const manager = createPgPoolManager(
    buildPgFoundationConfig({
      DATABASE_URL: "postgresql://clinic_user:secret@127.0.0.1:5432/dental_v2_local"
    }),
    FakePool
  );

  await assert.rejects(
    async () =>
      manager.withTransaction(async () => {
        throw new Error("forced failure");
      }),
    /forced failure/
  );

  assert.deepEqual(FakePool.instances[0]?.client.statements, ["BEGIN", "ROLLBACK"]);
});
