import assert from "node:assert/strict";
import test from "node:test";
import { assertStagingBuildEnvironment } from "./stagingBuildGuard.js";

const env = {
  VITE_APP_ENV: "staging",
  STAGING_SUPABASE_PROJECT_REF: "abcdefghijklmnoqrstuv",
  VITE_SUPABASE_URL: "https://abcdefghijklmnoqrstuv.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fictional",
  VITE_API_BASE_URL: "https://dental-record-staging-api.onrender.com/api"
};

test("staging build accepts an exact dedicated Supabase and Render target", () => {
  assert.doesNotThrow(() => assertStagingBuildEnvironment(env));
  assert.doesNotThrow(() => assertStagingBuildEnvironment({ VITE_APP_ENV: "local" }));
});

test("Vercel refuses builds missing explicit staging mode", () => {
  assert.throws(() => assertStagingBuildEnvironment({ VERCEL: "1" }), /VITE_APP_ENV=staging/);
  assert.throws(() => assertStagingBuildEnvironment({ VERCEL: "1", VITE_APP_ENV: "local" }), /VITE_APP_ENV=staging/);
  assert.doesNotThrow(() => assertStagingBuildEnvironment({ ...env, VERCEL: "1" }));
});

test("staging build rejects a development Supabase project", () => {
  assert.throws(
    () => assertStagingBuildEnvironment({ ...env, VITE_SUPABASE_URL: "https://differentproject.supabase.co" }),
    /does not match/
  );
  assert.throws(
    () => assertStagingBuildEnvironment({ ...env, STAGING_SUPABASE_PROJECT_REF: "" }),
    /STAGING_SUPABASE_PROJECT_REF/
  );
});

test("staging build rejects localhost, wrong Render host and path", () => {
  for (const api of [
    "http://127.0.0.1:3002/api",
    "https://wrong-api.onrender.com/api",
    "https://dental-record-staging-api.onrender.com/other",
    "https://dental-record-staging-api.onrender.com/api?token=x"
  ]) {
    assert.throws(() => assertStagingBuildEnvironment({ ...env, VITE_API_BASE_URL: api }), /Staging API/);
  }
});

test("staging build fails without a public Supabase key", () => {
  assert.throws(
    () => assertStagingBuildEnvironment({ ...env, VITE_SUPABASE_PUBLISHABLE_KEY: "" }),
    /VITE_SUPABASE_PUBLISHABLE_KEY/
  );
});
