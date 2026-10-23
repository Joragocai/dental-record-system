import test from "node:test";
import assert from "node:assert/strict";
import { getPostgresConfig, withPostgresTransaction } from "./pool.js";

test("Postgres config rejects missing or incorrect connection URLs", () => {
  assert.throws(() => getPostgresConfig({}), /DATABASE_URL/);
  assert.throws(() => getPostgresConfig({ DATABASE_URL: "https://example.com" }), /PostgreSQL/);
  assert.throws(() => getPostgresConfig({ DATABASE_URL: "bad-url" }), /PostgreSQL/);
});

test("Production Postgres configuration requires certificate-validated TLS", () => {
  const config = getPostgresConfig({ DATABASE_URL: "postgresql://user:pass@db.example.test:5432/clinic", NODE_ENV: "production" });
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.throws(() => getPostgresConfig({
    DATABASE_URL: "postgresql://user:pass@db.example.test/clinic",
    NODE_ENV: "production",
    PG_SSL_MODE: "disable"
  }), /require/);
});

test("Postgres transactions commit and always release their connection", async () => {
  const calls = [];
  const pool = { connect: async () => ({ query: async (sql) => { calls.push(sql); return { rows: [] }; }, release: () => calls.push("release") }) };
  const value = await withPostgresTransaction(async (client) => { await client.query("SELECT 1"); return 123; }, pool);
  assert.equal(value, 123);
  assert.deepEqual(calls, ["BEGIN", "SELECT 1", "COMMIT", "release"]);
});

test("Postgres transactions roll back on failure and release the connection", async () => {
  const calls = [];
  const pool = { connect: async () => ({ query: async (sql) => { calls.push(sql); }, release: () => calls.push("release") }) };
  await assert.rejects(withPostgresTransaction(async () => { throw new Error("write failed"); }, pool), /write failed/);
  assert.deepEqual(calls, ["BEGIN", "ROLLBACK", "release"]);
});
