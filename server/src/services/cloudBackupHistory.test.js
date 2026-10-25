import test from "node:test";
import assert from "node:assert/strict";
import { getLatestCloudBackupExport, recordCloudBackupExport } from "./cloudBackupHistory.js";

const userId = "123e4567-e89b-42d3-a456-426614174000";
const filename = "dental-demo-backup-20261025-123000.drb";
const generatedAt = "2026-10-25T04:30:00.000Z";

test("cloud export history queries only the authenticated user's records", async () => {
  const statements = [];
  const pool = {
    async query(sql, params) {
      statements.push({ sql, params });
      return { rows: [{ generated_at: generatedAt, filename, archive_bytes: 2048 }] };
    }
  };
  assert.deepEqual(await getLatestCloudBackupExport(pool, userId), {
    generatedAt, filename, archiveBytes: 2048
  });
  assert.match(statements[0].sql, /WHERE generated_by = \$1/);
  assert.match(statements[0].sql, /LIMIT 1/);
  assert.deepEqual(statements[0].params, [userId]);
});

test("cloud export history returns null without an export", async () => {
  const pool = { query: async () => ({ rows: [] }) };
  assert.equal(await getLatestCloudBackupExport(pool, userId), null);
});

test("cloud export metadata stores filename, size and verified user only", async () => {
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows: [{ generated_at: generatedAt, filename, archive_bytes: 2048 }] };
    }
  };
  const result = await recordCloudBackupExport(pool, { userId, filename, archiveBytes: 2048 });
  assert.deepEqual(result, { generatedAt, filename, archiveBytes: 2048 });
  assert.match(queries[0].sql, /INSERT INTO public.cloud_backup_exports/);
  assert.deepEqual(queries[0].params, [userId, filename, 2048]);
});

test("cloud export history rejects unauthenticated IDs and invalid filenames", async () => {
  const pool = { query: async () => { throw new Error("Query must not run."); } };
  await assert.rejects(getLatestCloudBackupExport(pool, null), /Authenticated user/);
  await assert.rejects(recordCloudBackupExport(pool, { userId: "not-uuid", filename, archiveBytes: 512 }), /Authenticated user/);
  await assert.rejects(recordCloudBackupExport(pool, { userId, filename: "../bad.drb", archiveBytes: 512 }), /Invalid encrypted export filename/);
  await assert.rejects(recordCloudBackupExport(pool, { userId, filename, archiveBytes: 0 }), /Invalid encrypted export size/);
});
