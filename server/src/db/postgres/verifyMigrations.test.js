import test from "node:test";
import assert from "node:assert/strict";
import { verifyPostgresMigrations } from "./verifyMigrations.js";

const migrations = [
  { name: "0001_core_schema.sql", checksum: "a".repeat(64) },
  { name: "0002_ledger.sql", checksum: "b".repeat(64) }
];

test("cloud startup allows only an exact migration manifest", async () => {
  const pool = { query: async () => ({rows:migrations.map(({name,checksum})=>({filename:name,checksum}))}) };
  assert.deepEqual(await verifyPostgresMigrations(pool,migrations),{verified:2});
});

test("cloud startup rejects missing, extra and changed migrations", async () => {
  for (const rows of [
    [{filename:migrations[0].name,checksum:migrations[0].checksum}],
    [...migrations.map(({name,checksum})=>({filename:name,checksum})),{filename:"0003_unknown.sql",checksum:"x"}],
    [{filename:migrations[0].name,checksum:"wrong"}, {filename:migrations[1].name,checksum:migrations[1].checksum}]
  ]) {
    await assert.rejects(verifyPostgresMigrations({query:async()=>({rows})},migrations), /migration/i);
  }
});

test("cloud startup fails closed when migration history is unavailable", async () => {
  await assert.rejects(verifyPostgresMigrations({query:async()=>{throw new Error("missing table")}},migrations),/migrations are missing/);
});
