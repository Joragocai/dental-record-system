import assert from "node:assert/strict";
import test from "node:test";
import { runPgMigrationCommand } from "./migrate.js";

test("runPgMigrationCommand rejects staging targets before creating a pool", async () => {
  let createPoolCalls = 0;

  await assert.rejects(
    async () =>
      runPgMigrationCommand({
        config: {
          appEnv: "staging",
          host: "db.example.com",
          port: 5432,
          database: "dental_v2_staging",
          username: "clinic_user",
          sslMode: "require",
          databaseUrl: "postgresql://clinic_user:secret@db.example.com:5432/dental_v2_staging",
          testDatabaseUrl: null,
          maxPoolSize: 10,
          idleTimeoutMs: 30_000,
          connectionTimeoutMs: 10_000,
          statementTimeoutMs: 15_000,
          applicationName: "dental-record-system-v2-foundation",
          allowProductionCommands: false
        },
        createPoolManager: () => {
          createPoolCalls += 1;
          throw new Error("pool creation should not happen");
        }
      }),
    /ALLOW_PRODUCTION_DB_COMMANDS=true/
  );

  assert.equal(createPoolCalls, 0);
});
