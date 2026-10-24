import test from "node:test";
import assert from "node:assert/strict";
import { getPostgresPool } from "../db/postgres/pool.js";
import { mutateCloudDemo, cloudDemoDataStatus } from "./cloudDemoService.js";

const enabled = process.env.PG_DEMO_INTEGRATION_TEST === "1";
(enabled ? test : test.skip)("local isolated demo Fill -> edit -> Reset -> Fill lifecycle", async () => {
  const target = new URL(process.env.DATABASE_URL || "");
  assert.equal(target.hostname, "127.0.0.1");
  assert.equal(target.pathname, "/dental_presentation_test");
  const pool = await getPostgresPool();
  const env = {
    ...process.env, NODE_ENV: "test", CLOUD_DEMO_ENABLED: "true",
    CLOUD_DEMO_ENVIRONMENT: "dental-presentation-demo",
    CLOUD_DEMO_PROJECT_REF: "local-test", CLOUD_DEMO_LOCAL_TEST: "true",
    SUPABASE_URL: "https://local-test.supabase.co"
  };
  const objects = new Map();
  const adapter = {
    config: {url:"https://local-test.supabase.co",key:"mock",bucket:"dental-demo-attachments"},
    async upload(_config, {path, contents}) { objects.set(path, Buffer.from(contents)); },
    async remove(_config, paths) { for (const path of paths) objects.delete(path); }
  };
  const ensureEmpty = async () => {
    const status = await pool.query(`SELECT
      (SELECT COUNT(*)::int FROM public.patients) AS patients,
      (SELECT COUNT(*)::int FROM public.treatments) AS treatments,
      (SELECT COUNT(*)::int FROM public.appointments) AS appointments,
      (SELECT COUNT(*)::int FROM public.attachments) AS attachments,
      (SELECT COUNT(*)::int FROM public.treatment_payments) AS payments`);
    assert.ok(Object.values(status.rows[0]).every(value => value === 0),
      "Refusing local demo lifecycle test on nonempty database");
  };
  try {
    await ensureEmpty();
    await pool.query(`INSERT INTO public.demo_environment_guard(singleton,project_ref,environment_name,enabled)
      VALUES(TRUE,'local-test','dental-presentation-demo',TRUE)
      ON CONFLICT(singleton) DO UPDATE
      SET project_ref=EXCLUDED.project_ref, environment_name=EXCLUDED.environment_name, enabled=TRUE`);
    const first = await mutateCloudDemo({pool,operation:"fill",env,adapter,anchorDate:"2026-10-23"});
    assert.equal(first.counts.patients, 40);
    assert.equal(first.counts.treatments, 54);
    const linkedCount = await pool.query("SELECT COUNT(*)::int AS n FROM public.appointments WHERE origin_treatment_id IS NOT NULL");
    assert.equal(first.counts.appointments, 38 + linkedCount.rows[0].n);
    assert.ok(linkedCount.rows[0].n > 0, "Fictional treatment follow-ups should have linked appointments");
    assert.equal(first.counts.attachments, 10);
    assert.equal(objects.size, 10);
    const patient = await pool.query("SELECT patient_id FROM public.patients ORDER BY patient_id LIMIT 1");
    await pool.query("UPDATE public.patients SET nickname=$1 WHERE patient_id=$2",["Fictional manually edited",patient.rows[0].patient_id]);
    const cleared = await mutateCloudDemo({pool,operation:"clear",env,adapter});
    assert.equal(cleared.isEmpty, true);
    assert.equal(objects.size, 0);
    const sequenceAfterReset = await pool.query("SELECT last_value, is_called FROM public.treatment_payments_id_seq");
    assert.equal(Number(sequenceAfterReset.rows[0].last_value), 1);
    assert.equal(sequenceAfterReset.rows[0].is_called, false);
    const second = await mutateCloudDemo({pool,operation:"fill",env,adapter,anchorDate:"2026-10-23"});
    const firstReusedId = await pool.query("SELECT MIN(id)::int AS id FROM public.treatment_payments");
    assert.equal(firstReusedId.rows[0].id, 1);
    assert.deepEqual(second.counts, first.counts);
    const cleanup = await mutateCloudDemo({pool,operation:"clear",env,adapter});
    assert.equal(cleanup.isEmpty,true);
    assert.equal(objects.size,0);
    const sequenceAfterSecondReset = await pool.query("SELECT last_value, is_called FROM public.treatment_payments_id_seq");
    assert.equal(Number(sequenceAfterSecondReset.rows[0].last_value), 1);
    assert.equal(sequenceAfterSecondReset.rows[0].is_called, false);
    const last = await cloudDemoDataStatus(pool,env);
    assert.equal(last.storageCleanupPending,0);
  } finally {
    try {
      const remaining = await pool.query("SELECT COUNT(*)::int AS n FROM public.patients");
      if (remaining.rows[0].n === 0) {
        await pool.query("DELETE FROM public.demo_environment_guard WHERE project_ref='local-test'");
      }
    } finally { await pool.end(); }
  }
});
