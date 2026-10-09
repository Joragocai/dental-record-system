import assert from "node:assert/strict";
import test from "node:test";
import { assertAttachmentLiveValidationTarget } from "./attachmentLiveValidationCli.js";

const stagingEnv = {
  ATTACHMENT_LIVE_VALIDATION: "YES",
  ATTACHMENT_LIVE_VALIDATION_TARGET: "staging",
  DENTAL_SERVER_ENV: "staging",
  DATABASE_URL: "postgresql://postgres.stage-example:fictional@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres",
  DATABASE_SSL_MODE: "require",
  ALLOW_PRODUCTION_DB_COMMANDS: "true",
  SUPABASE_URL: "https://stage-example.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_fictional",
  SUPABASE_ATTACHMENT_BUCKET: "dental-attachments-staging"
};

test("staging live attachment validation accepts only the explicit isolated staging target", () => {
  assert.doesNotThrow(() => assertAttachmentLiveValidationTarget(stagingEnv));
});

test("staging live attachment validation requires explicit mutation approval", () => {
  assert.throws(
    () => assertAttachmentLiveValidationTarget({ ...stagingEnv, ALLOW_PRODUCTION_DB_COMMANDS: "false" }),
    /Refusing to run mutating PostgreSQL commands/
  );
});

test("staging live attachment validation rejects wrong bucket or Supabase project", () => {
  assert.throws(
    () => assertAttachmentLiveValidationTarget({
      ...stagingEnv,
      SUPABASE_ATTACHMENT_BUCKET: "dental-attachments-dev"
    }),
    /dental-attachments-staging/
  );
  assert.throws(
    () => assertAttachmentLiveValidationTarget({
      ...stagingEnv,
      SUPABASE_URL: "https://different-project.supabase.co"
    }),
    /does not identify/
  );
});

test("staging live attachment validation cannot silently run against local or production", () => {
  assert.throws(
    () => assertAttachmentLiveValidationTarget({ ...stagingEnv, DENTAL_SERVER_ENV: "local" }),
    /requires DENTAL_SERVER_ENV=staging/
  );
  assert.throws(
    () => assertAttachmentLiveValidationTarget({ ...stagingEnv, DENTAL_SERVER_ENV: "production" }),
    /requires DENTAL_SERVER_ENV=staging/
  );
});

test("live attachment validation always requires the explicit YES gate", () => {
  assert.throws(
    () => assertAttachmentLiveValidationTarget({ ...stagingEnv, ATTACHMENT_LIVE_VALIDATION: "NO" }),
    /ATTACHMENT_LIVE_VALIDATION=YES/
  );
});
