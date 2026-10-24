import test from "node:test";
import assert from "node:assert/strict";
import { mutateCloudDemo, cloudDemoStatus } from "./cloudDemoService.js";

test("hosted Demo Fill and Reset fail closed with no database transaction when not opted in", async () => {
  let connections = 0;
  const pool = {connect: async () => {connections++; throw new Error("must not connect");}};
  for (const operation of ["fill", "clear"]) {
    await assert.rejects(mutateCloudDemo({pool, operation, env:{}}), /not enabled/);
  }
  assert.equal(connections, 0);
});

test("cloud runtime status hides demo tools when configuration is absent", async () => {
  const status = await cloudDemoStatus({query: async () => {throw new Error("unexpected query");}}, {});
  assert.equal(status.isDemoMode, false);
  assert.equal(status.automaticBackupEnabled, false);
});

const localDemoEnv = {
  CLOUD_DEMO_ENABLED: "true",
  CLOUD_DEMO_ENVIRONMENT: "dental-presentation-demo",
  CLOUD_DEMO_PROJECT_REF: "local-preview",
  CLOUD_LOCAL_PREVIEW: "true",
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://fake@127.0.0.1/dental_presentation_local",
  SUPABASE_URL: "https://example.supabase.co"
};

function fakeDemoPool({allowGuard = true, failRestart = false} = {}) {
  const statements = [];
  const query = async (sql) => {
    statements.push(sql);
    if (sql.includes("FROM public.demo_environment_guard")) {
      return { rows: [{project_ref: "local-preview", enabled: allowGuard, environment_name: "dental-presentation-demo"}] };
    }
    if (failRestart && sql.startsWith("ALTER TABLE public.treatment_payments")) {
      throw new Error("simulated identity restart failure");
    }
    if (sql.includes("COUNT(*)::integer AS pending")) return {rows: [{pending: 0}]};
    if (sql.includes("COUNT(*)::integer FROM public.patients")) {
      return {rows: [{patients: 0, treatments: 0, appointments: 0, attachments: 0}]};
    }
    return {rows: []};
  };
  return {
    pool: {query, connect: async () => ({query, release() {statements.push("RELEASE");}})},
    statements
  };
}

test("full Demo Reset restarts identity only after the database guard and clearing rows", async () => {
  const {pool, statements} = fakeDemoPool();
  const result = await mutateCloudDemo({
    pool, operation: "clear", env: localDemoEnv,
    adapter: {config: {localPreview: true}, remove: async () => {}}
  });
  assert.equal(result.status, "empty");
  const index = (value) => statements.findIndex(sql => sql.startsWith(value));
  assert.ok(index("SELECT project_ref, enabled") > index("SELECT pg_advisory_xact_lock"));
  assert.ok(index("LOCK TABLE public.treatment_payments") > index("SELECT project_ref, enabled"));
  assert.ok(index("ALTER TABLE public.treatment_payments ALTER COLUMN id RESTART WITH 1") > index("DELETE FROM public.treatment_payments"));
  assert.ok(index("COMMIT") > index("ALTER TABLE public.treatment_payments ALTER COLUMN id RESTART WITH 1"));
});

test("disabled demo guard cannot run ID reset or any deletion", async () => {
  const {pool, statements} = fakeDemoPool({allowGuard: false});
  await assert.rejects(mutateCloudDemo({
    pool, operation: "clear", env: localDemoEnv,
    adapter: {config: {localPreview: true}, remove: async () => {}}
  }), /not enabled/);
  assert.ok(statements.includes("ROLLBACK"));
  assert.equal(statements.some(sql => sql.startsWith("ALTER TABLE ") || sql.startsWith("DELETE FROM ")), false);
});

test("failed identity restart rolls back the complete demo reset transaction", async () => {
  const {pool, statements} = fakeDemoPool({failRestart: true});
  await assert.rejects(mutateCloudDemo({
    pool, operation: "clear", env: localDemoEnv,
    adapter: {config: {localPreview: true}, remove: async () => {}}
  }), /identity restart failure/);
  assert.ok(statements.includes("ROLLBACK"));
  assert.equal(statements.includes("COMMIT"), false);
});

test("local-preview identity resets reject nonlocal or production configurations before connecting", async () => {
  let connections = 0;
  const pool = {connect: async () => {connections++; throw new Error("should never connect");}};
  for (const env of [
    {...localDemoEnv, NODE_ENV: "production"},
    {...localDemoEnv, DATABASE_URL: "postgresql://fake@db.example.net/dental_presentation_local"},
    {...localDemoEnv, DATABASE_URL: "postgresql://fake@127.0.0.1/clinic_live"},
    {...localDemoEnv, CLOUD_DEMO_ENABLED: "false"}
  ]) {
    await assert.rejects(mutateCloudDemo({
      pool, operation: "clear", env, adapter: {config: {localPreview:true}}
    }), /not enabled/);
  }
  assert.equal(connections, 0);
});
