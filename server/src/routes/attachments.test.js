import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import app from "../app.js";
import { AuthenticationError } from "../auth/authErrors.ts";
import { createRequestIdMiddleware } from "../middleware/requestId.ts";
import { createAttachmentsRouter } from "./attachments.js";

const actorUserId = "11111111-1111-4111-8111-111111111111";
const actorAuthUserId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const patientId = "44444444-4444-4444-8444-444444444444";
const branchId = "55555555-5555-4555-8555-555555555555";
const attachmentId = "66666666-6666-4666-8666-666666666666";

async function withServer({ accessBoundary, attachmentRuntime }, callback) {
  const authenticationService = {
    async authenticateAuthorizationHeader(header) {
      if (!header) throw new AuthenticationError("CREDENTIALS_MISSING");
      return {
        subject: actorAuthUserId,
        email: "owner@example.test",
        audience: "authenticated",
        provider: "supabase"
      };
    }
  };

  const app = express();
  app.use(express.json());
  app.use(createRequestIdMiddleware({ createId: () => requestId }));
  app.use("/api/attachments", createAttachmentsRouter(authenticationService, accessBoundary, attachmentRuntime));
  app.use((error, _req, res, _next) => {
    if (error?.status) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: "Internal server error." });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function allowedBoundary(calls) {
  return {
    async resolveApplicationUser(_req, res, next) {
      calls.push("application-user");
      res.locals.applicationUser = {
        userId: actorUserId,
        authUserId: actorAuthUserId,
        roles: ["DENTIST"],
        branchIds: [branchId]
      };
      next();
    },
    async resolveAuthorization(_req, res, next) {
      calls.push("authorization");
      res.locals.authorization = { permissions: [] };
      next();
    },
    requirePermission(permission) {
      return async (_req, _res, next) => {
        calls.push(`permission:${permission}`);
        next();
      };
    },
    requireBranchPermission(permission, extractBranchId) {
      return async (req, _res, next) => {
        calls.push(`branch:${permission}:${extractBranchId(req)}`);
        next();
      };
    }
  };
}

function runtime(overrides = {}) {
  const calls = [];
  const service = {
    async createUploadIntent(input, actor) {
      calls.push({ method: "intent", input, actor });
      return {
        attachment: { id: attachmentId, status: "pending" },
        upload: {
          signedUrl: "https://storage.example/upload?token=fictional",
          token: "fictional",
          objectKey: `attachments/${attachmentId}/77777777-7777-4777-8777-777777777777.pdf`,
          expiresInSeconds: 7200
        }
      };
    },
    async getAccessContext(id) {
      calls.push({ method: "access", id });
      return { id, branchId, status: "uploaded" };
    },
    async complete(id, actor) {
      calls.push({ method: "complete", id, actor });
      return { id, branchId, status: "uploaded" };
    },
    async view(id, actor) {
      calls.push({ method: "view", id, actor });
      return { id, branchId, status: "uploaded" };
    },
    async createDownloadUrl(id, actor) {
      calls.push({ method: "download", id, actor });
      return { signedUrl: "https://storage.example/download?token=fictional", expiresInSeconds: 120 };
    },
    async updateMetadata(id, input, actor) {
      calls.push({ method: "update", id, input, actor });
      return { id, branchId, status: "uploaded" };
    },
    async deleteAttachment(id, actor) {
      calls.push({ method: "delete", id, actor });
      return { id, status: "deleted" };
    },
    ...overrides
  };
  return {
    calls,
    runtime: {
      getService: () => service,
      getStorage: () => { throw new Error("not used"); },
      async shutdown() {}
    }
  };
}

test("attachment routes require authentication before application access resolution", async () => {
  const accessCalls = [];
  const { runtime: attachmentRuntime } = runtime();
  await withServer({ accessBoundary: allowedBoundary(accessCalls), attachmentRuntime }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/attachments/${attachmentId}`);
    assert.equal(response.status, 401);
  });
  assert.deepEqual(accessCalls, []);
});

test("upload intent validates V2 UUID context and requires attachment.create for the target branch", async () => {
  const accessCalls = [];
  const harness = runtime();

  await withServer({ accessBoundary: allowedBoundary(accessCalls), attachmentRuntime: harness.runtime }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/attachments/upload-intent`, {
      method: "POST",
      headers: {
        Authorization: "Bearer token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        patientId,
        treatmentId: null,
        branchId,
        category: "X-ray",
        originalFilename: "fictional.pdf",
        mimeType: "application/pdf",
        sizeBytes: 120
      })
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).attachment.id, attachmentId);
  });

  assert.deepEqual(accessCalls, [
    "application-user",
    "authorization",
    `branch:attachment.create:${branchId}`
  ]);
  const intent = harness.calls.find((entry) => entry.method === "intent");
  assert.equal(intent.actor.requestId, requestId);
  assert.equal(intent.input.patientId, patientId);
});

test("detail and download URL use separate branch-scoped permissions", async () => {
  const accessCalls = [];
  const harness = runtime();

  await withServer({ accessBoundary: allowedBoundary(accessCalls), attachmentRuntime: harness.runtime }, async (baseUrl) => {
    const detail = await fetch(`${baseUrl}/api/attachments/${attachmentId}`, {
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(detail.status, 200);

    const download = await fetch(`${baseUrl}/api/attachments/${attachmentId}/download-url`, {
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(download.status, 200);
  });

  assert.ok(accessCalls.includes(`branch:attachment.read:${branchId}`));
  assert.ok(accessCalls.includes(`branch:attachment.download:${branchId}`));
});

test("metadata update and delete require their own branch permissions", async () => {
  const accessCalls = [];
  const harness = runtime();

  await withServer({ accessBoundary: allowedBoundary(accessCalls), attachmentRuntime: harness.runtime }, async (baseUrl) => {
    const update = await fetch(`${baseUrl}/api/attachments/${attachmentId}`, {
      method: "PATCH",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({ category: "Consent Form", description: null })
    });
    assert.equal(update.status, 200);

    const remove = await fetch(`${baseUrl}/api/attachments/${attachmentId}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(remove.status, 200);
  });

  assert.ok(accessCalls.includes(`branch:attachment.update:${branchId}`));
  assert.ok(accessCalls.includes(`branch:attachment.delete:${branchId}`));
});

test("legacy anonymous POST /api/attachments no longer exists", async () => {
  const accessCalls = [];
  const harness = runtime();

  await withServer({ accessBoundary: allowedBoundary(accessCalls), attachmentRuntime: harness.runtime }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    assert.equal(response.status, 404);
  });
  assert.deepEqual(accessCalls, []);
});

test("real V2 app no longer exposes unrestricted /uploads static files", async () => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/uploads/fictional-private-file.pdf`);
    assert.equal(response.status, 404);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
