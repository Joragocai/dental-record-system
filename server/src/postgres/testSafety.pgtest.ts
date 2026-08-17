import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeTestDatabaseTarget, getPgIntegrationReadiness, isLocalPgHost } from "./testSafety.js";

test("isLocalPgHost accepts only local test hosts", () => {
  assert.equal(isLocalPgHost("127.0.0.1"), true);
  assert.equal(isLocalPgHost("localhost"), true);
  assert.equal(isLocalPgHost("db.example.com"), false);
});

test("assertSafeTestDatabaseTarget accepts a separate local test database", () => {
  assert.doesNotThrow(() =>
    assertSafeTestDatabaseTarget(
      "postgresql://clinic_user:secret@127.0.0.1:5432/dental_v2_test",
      "postgresql://clinic_user:secret@127.0.0.1:5432/dental_v2_local",
      "test"
    )
  );
});

test("assertSafeTestDatabaseTarget rejects non-test environments", () => {
  assert.throws(
    () =>
      assertSafeTestDatabaseTarget(
        "postgresql://clinic_user:secret@127.0.0.1:5432/dental_v2_test",
        "postgresql://clinic_user:secret@127.0.0.1:5432/dental_v2_local",
        "local"
      ),
    /DENTAL_SERVER_ENV=test/
  );
});

test("assertSafeTestDatabaseTarget rejects matching primary and test URLs", () => {
  assert.throws(
    () =>
      assertSafeTestDatabaseTarget(
        "postgresql://clinic_user:secret@127.0.0.1:5432/dental_v2_local",
        "postgresql://clinic_user:secret@127.0.0.1:5432/dental_v2_local",
        "test"
      ),
    /must not match/
  );
});

test("assertSafeTestDatabaseTarget rejects remote or non-test database names", () => {
  assert.throws(
    () =>
      assertSafeTestDatabaseTarget(
        "postgresql://clinic_user:secret@db.example.com:5432/dental_v2_test",
        "postgresql://clinic_user:secret@127.0.0.1:5432/dental_v2_local",
        "test"
      ),
    /local PostgreSQL host/
  );

  assert.throws(
    () =>
      assertSafeTestDatabaseTarget(
        "postgresql://clinic_user:secret@127.0.0.1:5432/dental_v2_local",
        "postgresql://clinic_user:secret@127.0.0.1:5432/dental_v2_prod",
        "test"
      ),
    /must clearly identify a test database/
  );
});

test("getPgIntegrationReadiness reports the missing TEST_DATABASE_URL prerequisite", () => {
  const readiness = getPgIntegrationReadiness({
    DENTAL_SERVER_ENV: "test",
    DATABASE_URL: "postgresql://clinic_user:secret@127.0.0.1:5432/dental_v2_local"
  });

  assert.equal(readiness.ready, false);
  assert.equal(readiness.reason, "TEST_DATABASE_URL is not configured.");
});
