import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertPgMutationAllowed,
  buildPgFoundationConfig,
  buildPgPoolConfig,
  formatPgTarget
} from "./config.js";

test("buildPgFoundationConfig parses local PostgreSQL settings with safe defaults", () => {
  const config = buildPgFoundationConfig({
    DATABASE_URL: "postgresql://clinic_user:secret@127.0.0.1:5432/dental_v2_local"
  });

  assert.equal(config.appEnv, "local");
  assert.equal(config.sslMode, "disable");
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.database, "dental_v2_local");
  assert.equal(config.username, "clinic_user");
  assert.equal(config.maxPoolSize, 10);
  assert.equal(
    formatPgTarget(config),
    "local postgresql://127.0.0.1:5432/dental_v2_local?ssl=disable"
  );
});

test("buildPgFoundationConfig requires DATABASE_URL", () => {
  assert.throws(() => buildPgFoundationConfig({}), /DATABASE_URL is required/);
});

test("buildPgFoundationConfig rejects non-PostgreSQL protocols", () => {
  assert.throws(
    () => buildPgFoundationConfig({ DATABASE_URL: "mysql://clinic_user@127.0.0.1:3306/dental_v2_local" }),
    /postgres/
  );
});

test("buildPgFoundationConfig defaults staging and production SSL mode to require", () => {
  const config = buildPgFoundationConfig({
    DENTAL_SERVER_ENV: "production",
    DATABASE_URL: "postgresql://clinic_user:secret@db.example.com:5432/dental_v2_prod"
  });

  assert.equal(config.appEnv, "production");
  assert.equal(config.sslMode, "require");
  const poolConfig = buildPgPoolConfig(config);
  assert.deepEqual(poolConfig.ssl, { rejectUnauthorized: true });
});

test("verified SSL uses a provided Supabase CA certificate without disabling verification", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "dental-staging-ca-"));
  const certificatePath = path.join(tempDir, "staging-ca.crt");
  const fakeCertificate = "-----BEGIN CERTIFICATE-----\nZmljdGlvbmFs\n-----END CERTIFICATE-----\n";
  try {
    writeFileSync(certificatePath, fakeCertificate, "utf8");
    const config = buildPgFoundationConfig({
      DENTAL_SERVER_ENV: "staging",
      DATABASE_URL: "postgresql://postgres:fictional@db.staging.example.test:5432/postgres",
      DATABASE_SSL_MODE: "require",
      DATABASE_SSL_CA_FILE: certificatePath
    });

    assert.equal(config.sslCaFile, certificatePath);
    assert.deepEqual(buildPgPoolConfig(config).ssl, {
      rejectUnauthorized: true,
      ca: fakeCertificate
    });
    assert.throws(
      () => buildPgFoundationConfig({
        DATABASE_URL: "postgresql://postgres:fictional@localhost:5432/postgres",
        DATABASE_SSL_MODE: "no-verify",
        DATABASE_SSL_CA_FILE: certificatePath
      }),
      /requires DATABASE_SSL_MODE=require/
    );

    writeFileSync(certificatePath, "not a certificate", "utf8");
    assert.throws(() => buildPgPoolConfig(config), /PEM-encoded CA certificate/);

    rmSync(certificatePath);
    assert.throws(() => buildPgPoolConfig(config), /cannot be read/);
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

test("buildPgFoundationConfig accepts explicit no-verify SSL mode and test database URL", () => {
  const config = buildPgFoundationConfig({
    DENTAL_SERVER_ENV: "test",
    DATABASE_URL: "postgresql://clinic_user:secret@127.0.0.1:5432/dental_v2_local",
    TEST_DATABASE_URL: "postgresql://clinic_user:secret@127.0.0.1:5432/dental_v2_test",
    DATABASE_SSL_MODE: "no-verify"
  });

  assert.equal(config.sslMode, "no-verify");
  assert.equal(config.testDatabaseUrl, "postgresql://clinic_user:secret@127.0.0.1:5432/dental_v2_test");
});

test("assertPgMutationAllowed blocks production-like environments by default", () => {
  const config = buildPgFoundationConfig({
    DENTAL_SERVER_ENV: "staging",
    DATABASE_URL: "postgresql://clinic_user:secret@db.example.com:5432/dental_v2_staging"
  });

  assert.throws(
    () => assertPgMutationAllowed(config),
    /ALLOW_PRODUCTION_DB_COMMANDS=true/
  );
});

test("assertPgMutationAllowed allows explicit staging or production opt-in", () => {
  const config = buildPgFoundationConfig({
    DENTAL_SERVER_ENV: "production",
    DATABASE_URL: "postgresql://clinic_user:secret@db.example.com:5432/dental_v2_prod",
    ALLOW_PRODUCTION_DB_COMMANDS: "true"
  });

  assert.doesNotThrow(() => assertPgMutationAllowed(config));
});
