import test from "node:test";
import assert from "node:assert/strict";
import { createEncryptedCloudBackup, inspectEncryptedCloudBackup } from "./cloudBackupArchive.js";
import { cloudBackupAvailability, getCloudBackupConfiguration } from "./cloudBackupSnapshot.js";

const passphrase = "fictional-archive-safety-phrase";
const records = {
  patients: [{ id: 1, patient_id: "P-2026-0001", first_name: "Fictional" }],
  treatments: [], appointments: [], treatment_payments: [],
  attachments: [{ id: 1, patient_id: "P-2026-0001", file_path: "patients/P-2026-0001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.txt" }],
  public_id_counters: [{ prefix: "P", sequence_year: 2026, last_value: 1 }]
};
const files = [{ path: records.attachments[0].file_path, contents: Buffer.from("Private fictional attachment") }];
const migrations = [{ filename: "0001_core_schema.sql", checksum: "fictional-hash" }];

test("encrypted backup roundtrip recovers clinical rows and private attachment bytes", async () => {
  const { data, manifest } = await createEncryptedCloudBackup({
    projectRef: "demo-project-123", records, migrations, files
  }, passphrase);
  assert.equal(data.subarray(0, 8).toString("ascii"), "DENTBAK1");
  assert.equal(data.includes(Buffer.from("Fictional")), false);
  assert.equal(manifest.counts.patients, 1);
  const restored = await inspectEncryptedCloudBackup(data, passphrase);
  assert.deepEqual(restored.snapshot.tables, records);
  assert.deepEqual(restored.snapshot.migrations, migrations);
  assert.deepEqual(restored.files, files);
});

test("backup rejects incorrect passphrases and tampering", async () => {
  const { data } = await createEncryptedCloudBackup({ projectRef: "demo-project-123", records, migrations, files }, passphrase);
  await assert.rejects(inspectEncryptedCloudBackup(data, "other-long-backup-secret"), /invalid/);
  const modified = Buffer.from(data);
  modified[modified.length - 1] ^= 0x2;
  await assert.rejects(inspectEncryptedCloudBackup(modified, passphrase), /invalid/);
  await assert.rejects(createEncryptedCloudBackup({ projectRef: "demo-project-123", records, migrations, files }, "short"), /passphrase/);
});

test("backup configuration is independent from Demo Reset and requires exact project identity", () => {
  const env = {
    CLOUD_BACKUP_DOWNLOAD_ENABLED: "true",
    CLOUD_BACKUP_ENVIRONMENT: "dental-presentation-demo",
    CLOUD_BACKUP_PROJECT_REF: "demo-project-123",
    SUPABASE_URL: "https://demo-project-123.supabase.co",
    DATABASE_URL: "postgresql://postgres.demo-project-123:fictional@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
    CLOUD_DEMO_ENABLED: "false"
  };
  assert.equal(getCloudBackupConfiguration(env).ref, "demo-project-123");
  assert.equal(cloudBackupAvailability(env), true);
  assert.equal(cloudBackupAvailability({ ...env, CLOUD_BACKUP_PROJECT_REF: "other-project-123" }), false);
  assert.equal(cloudBackupAvailability({ ...env, CLOUD_BACKUP_DOWNLOAD_ENABLED: "false" }), false);
});
