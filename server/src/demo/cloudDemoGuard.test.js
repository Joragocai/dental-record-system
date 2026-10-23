import test from "node:test";
import assert from "node:assert/strict";
import { getCloudDemoConfiguration, assertCloudDemoGuard, validateDemoStorageObjectPath } from "./cloudDemoGuard.js";
import { prepareFictionalDemoFixture } from "./cloudDemoSeed.js";

const env = {
  CLOUD_DEMO_ENABLED: "true", CLOUD_DEMO_ENVIRONMENT: "dental-presentation-demo",
  CLOUD_DEMO_PROJECT_REF: "local-test", CLOUD_DEMO_LOCAL_TEST: "true",
  NODE_ENV: "test", DATABASE_URL: "postgresql://test@127.0.0.1/dental_presentation_test",
  SUPABASE_URL: "https://example.supabase.co"
};
test("Demo reset requires explicit environment opt-in", () => {
  assert.throws(() => getCloudDemoConfiguration({...env, CLOUD_DEMO_ENABLED: "false"}), /not enabled/);
  assert.throws(() => getCloudDemoConfiguration({...env, DATABASE_URL:"postgresql://x@prod.example.com/postgres"}), /not enabled/);
  assert.deepEqual(getCloudDemoConfiguration(env), {ref:"local-test", localTest:true});
});
test("Demo reset requires matching enabled PostgreSQL sentinel", async () => {
  const config=getCloudDemoConfiguration(env);
  await assert.rejects(assertCloudDemoGuard({query:async()=>({rows:[]})},config),/not enabled/);
  await assert.rejects(assertCloudDemoGuard({query:async()=>({rows:[{project_ref:"wrong",enabled:true,environment_name:"dental-presentation-demo"}]})},config),/not enabled/);
  await assertCloudDemoGuard({query:async()=>({rows:[{project_ref:"local-test",enabled:true,environment_name:"dental-presentation-demo"}]})},config);
});
test("Only private attachments with approved fictional owner paths can enter cleanup", () => {
  assert.equal(validateDemoStorageObjectPath("patients/P-2026-0001/123e4567-e89b-12d3-a456-426614174000.png").endsWith(".png"),true);
  assert.throws(()=>validateDemoStorageObjectPath("../uploads/private.png"),/unexpected/);
});
test("Hosted fictional fixture validates before PostgreSQL mutation", () => {
  const data=prepareFictionalDemoFixture("2026-10-23");
  assert.deepEqual(data.counts,{patients:40,treatments:54,appointments:38,attachments:10});
});
