import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { createCloudBackupRouter } from "./cloudBackup.js";

const userId = "123e4567-e89b-42d3-a456-426614174000";
const filename = "dental-demo-backup-20261025-123000.drb";
const generatedAt = "2026-10-25T04:30:00.000Z";
const env = {
  CLOUD_BACKUP_DOWNLOAD_ENABLED: "true",
  CLOUD_BACKUP_ENVIRONMENT: "dental-presentation-demo",
  CLOUD_BACKUP_PROJECT_REF: "demo-project-123",
  SUPABASE_URL: "https://demo-project-123.supabase.co",
  DATABASE_URL: "postgresql://postgres.demo-project-123:fictional@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"
};

async function withServer(pool, callback, createDownload = async () => ({
  filename, data: Buffer.from("fictional encrypted archive")
})) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.clinicAuth = {userId}; next(); });
  app.use(createCloudBackupRouter(pool, env, {createDownload}));
  app.use((error, _req, res, _next) => res.status(500).json({message: error.message}));
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try { await callback("http://127.0.0.1:" + server.address().port); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test("cloud backup status reads authenticated export metadata from PostgreSQL", async () => {
  const pool = { query: async (sql, params) => {
    assert.match(sql, /WHERE generated_by = \$1/);
    assert.deepEqual(params, [userId]);
    return {rows:[{generated_at:generatedAt,filename,archive_bytes:25}]};
  }};
  await withServer(pool, async origin => {
    const response = await fetch(origin + "/backup/status");
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.latestExport.filename, filename);
    assert.equal(result.latestExport.generatedAt, generatedAt);
    assert.equal(result.backupDownloadAvailable, true);
  });
});

test("cloud download records generated metadata before serving archive", async () => {
  let inserted = false;
  const pool = { query: async (sql, params) => {
    assert.match(sql, /INSERT INTO public.cloud_backup_exports/);
    assert.deepEqual(params, [userId, filename, 26]);
    inserted = true;
    return {rows:[{generated_at:generatedAt,filename,archive_bytes:26}]};
  }};
  await withServer(pool, async origin => {
    const response = await fetch(origin + "/backup/download", {
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({passphrase:"fictional-long-secret"})
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-disposition"), 'attachment; filename="' + filename + '"');
    assert.equal(inserted, true);
  }, async () => ({filename,data:Buffer.alloc(26, 1)}));
});

test("cloud download fails closed when export history cannot be stored", async () => {
  const pool = { query: async () => { throw new Error("history unavailable"); } };
  await withServer(pool, async origin => {
    const response = await fetch(origin + "/backup/download", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({passphrase:"fictional-long-secret"})
    });
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("content-disposition"), null);
  });
});
