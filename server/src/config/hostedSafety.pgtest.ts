import assert from "node:assert/strict";
import test from "node:test";
import { getAllowedCorsOrigins, isHostedEnvironment, validateHostedConfiguration } from "./hostedSafety.js";

const stagingEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  DENTAL_SERVER_ENV: "staging",
  CORS_ALLOWED_ORIGINS: "https://stage.example.test",
  DATABASE_URL: "postgresql://postgres:fake@db.stage-example.supabase.co:5432/postgres",
  DATABASE_SSL_MODE: "require",
  SUPABASE_URL: "https://stage-example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public-test-key",
  SUPABASE_SECRET_KEY: "server-only-fake-key",
  SUPABASE_ATTACHMENT_BUCKET: "dental-attachments-staging",
  STAFF_INVITE_REDIRECT_URL: "https://stage.example.test/activate-account"
};

test("local development keeps its loopback origins without hosted secrets", () => {
  assert.equal(isHostedEnvironment({ DENTAL_SERVER_ENV: "local" }), false);
  assert.ok(getAllowedCorsOrigins({ DENTAL_SERVER_ENV: "local" }).includes("http://127.0.0.1:5173"));
  assert.doesNotThrow(() => validateHostedConfiguration({ DENTAL_SERVER_ENV: "local" }));
});

test("hosted startup requires explicit environment and exact HTTPS CORS origins", () => {
  assert.throws(() => isHostedEnvironment({ NODE_ENV: "production" }), /explicit DENTAL_SERVER_ENV/);
  assert.throws(() => getAllowedCorsOrigins({ DENTAL_SERVER_ENV: "staging" }), /CORS_ALLOWED_ORIGINS/);
  assert.throws(() => getAllowedCorsOrigins({ DENTAL_SERVER_ENV: "staging", CORS_ALLOWED_ORIGINS: "https://stage.example.test/extra" }), /exact HTTPS origins/);
  assert.throws(() => getAllowedCorsOrigins({ DENTAL_SERVER_ENV: "staging", CORS_ALLOWED_ORIGINS: "http://stage.example.test" }), /exact HTTPS origins/);
  assert.deepEqual(getAllowedCorsOrigins(stagingEnv), ["https://stage.example.test"]);
});

test("valid fictional staging environment passes startup validation", () => {
  assert.doesNotThrow(() => validateHostedConfiguration(stagingEnv));
});

test("staging rejects a database URL copied from another Supabase project", () => {
  assert.throws(
    () => validateHostedConfiguration({
      ...stagingEnv,
      DATABASE_URL: "postgresql://postgres:fictional@db.dev-example.supabase.co:5432/postgres"
    }),
    /does not identify the configured Supabase project/
  );

  assert.doesNotThrow(() => validateHostedConfiguration({
    ...stagingEnv,
    DATABASE_URL: "postgresql://postgres.stage-example:fictional@aws-0-xx.pooler.supabase.com:5432/postgres"
  }));

  assert.throws(
    () => validateHostedConfiguration({
      ...stagingEnv,
      DATABASE_URL: "postgresql://postgres.dev-example:fictional@aws-0-xx.pooler.supabase.com:5432/postgres"
    }),
    /does not identify the configured Supabase project/
  );
});

test("hosted startup refuses missing secrets, unverified TLS and wrong invitation host", () => {
  assert.throws(() => validateHostedConfiguration({ ...stagingEnv, SUPABASE_SECRET_KEY: "" }), /SUPABASE_SECRET_KEY/);
  assert.throws(() => validateHostedConfiguration({ ...stagingEnv, DATABASE_SSL_MODE: "no-verify" }), /verified TLS/);
  assert.throws(() => validateHostedConfiguration({ ...stagingEnv, STAFF_INVITE_REDIRECT_URL: "https://other.example.test/activate-account" }), /STAFF_INVITE_REDIRECT_URL/);
  assert.throws(() => validateHostedConfiguration({ ...stagingEnv, STAFF_INVITE_REDIRECT_URL: "http://localhost:5173/activate-account" }), /STAFF_INVITE_REDIRECT_URL/);
});

test("production does not accept a development attachment bucket", () => {
  assert.throws(() => validateHostedConfiguration({ ...stagingEnv, DENTAL_SERVER_ENV: "production", SUPABASE_ATTACHMENT_BUCKET: "dental-attachments-dev" }), /development attachment bucket/);
});
