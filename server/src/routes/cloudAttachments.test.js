import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import express from "express";
import { createCloudAttachmentsRouter } from "./cloudAttachments.js";

const patient = { patient_id: "P-2026-0001" };
const treatment = { treatment_id: "T-2026-0001", patient_id: patient.patient_id };
const filename = "patients/P-2026-0001/123e4567-e89b-12d3-a456-426614174000.png";
const attachment = { id: 1, patient_id: patient.patient_id, file_path: filename, mime_type: "image/png", original_filename: "fictional.png" };

function fixture({ storageFails = false, metadataFails = false } = {}) {
  const operations = [];
  const pool = {
    async query(sql) {
      if (sql.includes("FROM public.patients")) return { rows: [patient] };
      if (sql.includes("FROM public.treatments")) return { rows: [treatment] };
      if (sql.includes("FROM public.attachments") && sql.includes("FOR UPDATE")) return { rows: [attachment] };
      if (sql.includes("INSERT INTO public.attachments")) {
        if (metadataFails) throw new Error("Database insertion failed");
        return { rows: [attachment] };
      }
      if (sql.includes("DELETE FROM public.attachments")) {
        if (metadataFails) throw new Error("Database delete failed");
        return { rows: [attachment] };
      }
      if (sql.includes("FROM public.attachments")) return { rows: [attachment] };
      return { rows: [] };
    },
    async connect() {
      return { query: (...args) => pool.query(...args), release() {} };
    }
  };
  const dependencies = {
    storageConfig: () => ({ key: "fake-key" }),
    async upload(_config, data) { operations.push(["upload", data.path]); },
    async download(_config, path) {
      operations.push(["download", path]);
      return { arrayBuffer: async () => Buffer.from("fictional-image") };
    },
    async remove(_config, paths) {
      operations.push(["remove", paths[0]]);
      if (storageFails) throw new Error("Provider failed");
    }
  };
  return { pool, dependencies, operations };
}
async function serve(fixture, cb) {
  const app = express();
  app.use("/api", createCloudAttachmentsRouter(fixture.pool, fixture.dependencies));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try { await cb("http://127.0.0.1:" + server.address().port); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
test("patient attachment upload stores private object and PostgreSQL metadata", async () => {
  const f = fixture();
  await serve(f, async url => {
    const form = new FormData();
    form.set("patient_id", patient.patient_id);
    form.set("attachment_type", "X-ray");
    form.set("file", new Blob(["fictional-png"], { type: "image/png" }), "fictional.png");
    const response = await fetch(url + "/api/attachments", { method: "POST", body: form });
    assert.equal(response.status, 201, await response.text().then(text => text));
    assert.equal(f.operations[0][0], "upload");
    assert.ok(f.operations[0][1].startsWith("patients/P-2026-0001/"));
  });
});
test("mismatched treatment ID is rejected before upload", async () => {
  const f = fixture();
  await serve(f, async url => {
    const form = new FormData();
    form.set("patient_id", patient.patient_id);
    form.set("treatment_id", "T-2026-9999");
    form.set("attachment_type", "Photo");
    form.set("file", new Blob(["fake"], { type: "image/png" }), "fake.png");
    const response = await fetch(url + "/api/treatments/T-2026-0001/attachments", { method: "POST", body: form });
    assert.equal(response.status, 400);
    assert.equal(f.operations.length, 0);
  });
});
test("private image preview uses restrictive response headers", async () => {
  const f = fixture();
  await serve(f, async url => {
    const response = await fetch(url + "/api/attachments/1/preview");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("content-type"), "image/png");
  });
});
test("private downloads are attachments, not public storage redirects", async () => {
  await serve(fixture(), async url => {
    const response = await fetch(url + "/api/attachments/1/download");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-disposition"), /attachment/);
  });
});
test("invalid attachment identifiers are rejected", async () => {
  const f = fixture();
  await serve(f, async url => {
    assert.equal((await fetch(url + "/api/attachments/not-an-id/preview")).status, 400);
    assert.equal(f.operations.length, 0);
  });
});
test("Storage deletion failure preserves attachment metadata", async () => {
  const f = fixture({ storageFails: true });
  await serve(f, async url => {
    const response = await fetch(url + "/api/attachments/1", { method: "DELETE" });
    assert.equal(response.status, 500);
    assert.deepEqual(f.operations.map(entry => entry[0]), ["download", "remove"]);
  });
});
test("Database deletion failure triggers Storage restoration attempt", async () => {
  const f = fixture({ metadataFails: true });
  await serve(f, async url => {
    const response = await fetch(url + "/api/attachments/1", { method: "DELETE" });
    assert.equal(response.status, 500);
    assert.deepEqual(f.operations.map(entry => entry[0]), ["download", "remove", "upload"]);
  });
});
