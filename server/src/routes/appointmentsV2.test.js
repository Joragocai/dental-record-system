import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { AuthenticationError } from "../auth/authErrors.ts";
import { AuthorizationError } from "../services/authorizationErrors.ts";
import { AppointmentDomainError } from "../services/appointmentDomainErrors.ts";
import { createRequestIdMiddleware } from "../middleware/requestId.ts";
import {
  createAppointmentsRouter,
  createAppointmentCalendarRouter
} from "./appointmentsV2.js";

const actorUserId = "11111111-1111-4111-8111-111111111111";
const actorAuthUserId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const branchA = "44444444-4444-4444-8444-444444444444";
const branchB = "55555555-5555-4555-8555-555555555555";
const appointmentId = "66666666-6666-4666-8666-666666666666";
const patientId = "77777777-7777-4777-8777-777777777777";
const dentistId = "88888888-8888-4888-8888-888888888888";

const permissions = [
  "appointment.list",
  "appointment.read",
  "appointment.patient_lookup",
  "appointment.create",
  "appointment.update",
  "appointment.confirm",
  "appointment.reschedule",
  "appointment.cancel",
  "appointment.check_in",
  "appointment.complete",
  "appointment.no_show"
];

function authService() {
  return {
    async authenticateAuthorizationHeader(header) {
      if (!header) throw new AuthenticationError("CREDENTIALS_MISSING");
      return {
        subject: actorAuthUserId,
        email: "personnel@example.test",
        audience: "authenticated",
        provider: "supabase"
      };
    }
  };
}

function allowedBoundary(calls, options = {}) {
  return {
    async resolveApplicationUser(_req, res, next) {
      calls.push("application-user");
      res.locals.applicationUser = {
        userId: actorUserId,
        authUserId: actorAuthUserId,
        roles: ["PERSONNEL"],
        branchIds: [branchA, branchB]
      };
      next();
    },
    async resolveAuthorization(_req, res, next) {
      calls.push("authorization");
      res.locals.authorization = {
        userId: actorUserId,
        authUserId: actorAuthUserId,
        roles: ["PERSONNEL"],
        branchIds: [branchA, branchB],
        permissions: permissions.map((code) => ({ code, scope: "BRANCH" }))
      };
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
        const branchId = extractBranchId(req);
        calls.push(`branch:${permission}:${branchId}`);
        if (options.denyPermission === permission) {
          next(new AuthorizationError("AUTHORIZATION_DENIED"));
          return;
        }
        next();
      };
    }
  };
}

function createRuntime(overrides = {}) {
  const calls = [];
  const service = {
    async getAccessContext(id) {
      calls.push({ method: "access", id });
      return { id, branchId: branchA, status: "confirmed" };
    },
    async listAppointments(input, actor) {
      calls.push({ method: "list", input, actor });
      return [];
    },
    async getAppointment(id, actor) {
      calls.push({ method: "detail", id, actor });
      return { id, branchId: branchA, status: "confirmed" };
    },
    async getSchedulingContext(id, actor) {
      calls.push({ method: "context", id, actor });
      return { branch: { id, branchCode: "A", branchName: "Branch A" }, dentists: [] };
    },
    async searchPatients(query, id, actor) {
      calls.push({ method: "search", query, branchId: id, actor });
      return [];
    },
    async checkAvailability(input, actor) {
      calls.push({ method: "availability", input, actor });
      return { available: true };
    },
    async createAppointment(input, actor) {
      calls.push({ method: "create", input, actor });
      return { id: appointmentId, branchId: input.branchId, status: "confirmed" };
    },
    async updateAppointment(id, input, actor) {
      calls.push({ method: "update", id, input, actor });
      return { id, branchId: branchA, status: "confirmed" };
    },
    async confirmAppointment(id, input, actor) {
      calls.push({ method: "confirm", id, input, actor });
      return { id, branchId: branchA, status: "confirmed" };
    },
    async rescheduleAppointment(id, input, actor) {
      calls.push({ method: "reschedule", id, input, actor });
      return { id: "99999999-9999-4999-8999-999999999999", branchId: input.branchId, status: "confirmed" };
    },
    async cancelAppointment(id, input, actor) {
      calls.push({ method: "cancel", id, input, actor });
      return { id, branchId: branchA, status: "cancelled_by_clinic" };
    },
    async checkInAppointment(id, actor) {
      calls.push({ method: "check-in", id, actor });
      return { id, branchId: branchA, status: "checked_in" };
    },
    async startAppointment(id, actor) {
      calls.push({ method: "start", id, actor });
      return { id, branchId: branchA, status: "in_progress" };
    },
    async completeAppointment(id, actor) {
      calls.push({ method: "complete", id, actor });
      return { id, branchId: branchA, status: "completed" };
    },
    async markNoShow(id, actor) {
      calls.push({ method: "no-show", id, actor });
      return { id, branchId: branchA, status: "no_show" };
    },
    ...overrides
  };

  return {
    calls,
    runtime: {
      getService: () => service,
      async shutdown() {}
    }
  };
}

async function withServer({ boundary, runtime, calendar = false }, callback) {
  const app = express();
  app.use(express.json());
  app.use(createRequestIdMiddleware({ createId: () => requestId }));
  const router = calendar
    ? createAppointmentCalendarRouter(authService(), boundary, runtime)
    : createAppointmentsRouter(authService(), boundary, runtime);
  app.use(calendar ? "/api/calendar" : "/api/appointments", router);
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

test("appointment routes require authentication before application/RBAC resolution", async () => {
  const accessCalls = [];
  const harness = createRuntime();
  await withServer({
    boundary: allowedBoundary(accessCalls),
    runtime: harness.runtime
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/appointments?branchId=${branchA}`);
    assert.equal(response.status, 401);
  });
  assert.deepEqual(accessCalls, []);
  assert.equal(harness.calls.length, 0);
});

test("list uses branch-scoped appointment.list and forwards only trusted actor context", async () => {
  const accessCalls = [];
  const harness = createRuntime();
  await withServer({
    boundary: allowedBoundary(accessCalls),
    runtime: harness.runtime
  }, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/appointments?branchId=${branchA}&date=2026-10-20&status=confirmed`,
      { headers: { Authorization: "Bearer token" } }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
  });

  assert.deepEqual(accessCalls, [
    "application-user",
    "authorization",
    `branch:appointment.list:${branchA}`
  ]);
  const call = harness.calls.find((entry) => entry.method === "list");
  assert.equal(call.input.branchId, branchA);
  assert.equal(call.input.status, "confirmed");
  assert.deepEqual(call.actor.branchIds, [branchA, branchB]);
  assert.deepEqual(call.actor.permissions, permissions);
  assert.equal(call.actor.userId, actorUserId);
  assert.equal(call.actor.authUserId, actorAuthUserId);
  assert.equal(call.actor.requestId, requestId);
});

test("detail and state actions authorize against the stored appointment branch", async () => {
  const accessCalls = [];
  const harness = createRuntime();

  await withServer({
    boundary: allowedBoundary(accessCalls),
    runtime: harness.runtime
  }, async (baseUrl) => {
    const detail = await fetch(`${baseUrl}/api/appointments/${appointmentId}`, {
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(detail.status, 200);

    const cancel = await fetch(`${baseUrl}/api/appointments/${appointmentId}/cancel`, {
      method: "POST",
      headers: { Authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({ reason: "Fictional cancellation" })
    });
    assert.equal(cancel.status, 200);
  });

  assert.ok(accessCalls.includes(`branch:appointment.read:${branchA}`));
  assert.ok(accessCalls.includes(`branch:appointment.cancel:${branchA}`));
  assert.equal(harness.calls.filter((entry) => entry.method === "access").length, 2);
});

test("reschedule requires appointment.reschedule on both source and target branches", async () => {
  const accessCalls = [];
  const harness = createRuntime();

  await withServer({
    boundary: allowedBoundary(accessCalls),
    runtime: harness.runtime
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/appointments/${appointmentId}/reschedule`, {
      method: "POST",
      headers: { Authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({
        branchId: branchB,
        dentistUserId: dentistId,
        appointmentDate: "2026-10-22",
        appointmentTime: "10:00",
        durationMinutes: 30
      })
    });
    assert.equal(response.status, 200);
  });

  assert.ok(accessCalls.includes(`branch:appointment.reschedule:${branchA}`));
  assert.ok(accessCalls.includes(`branch:appointment.reschedule:${branchB}`));
  const call = harness.calls.find((entry) => entry.method === "reschedule");
  assert.equal(call.input.branchId, branchB);
});

test("start requires appointment.start and denial prevents the domain call", async () => {
  const accessCalls = [];
  const harness = createRuntime();

  await withServer({
    boundary: allowedBoundary(accessCalls, { denyPermission: "appointment.start" }),
    runtime: harness.runtime
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/appointments/${appointmentId}/start`, {
      method: "POST",
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      message: "You are not authorized to perform this action."
    });
  });

  assert.equal(harness.calls.some((entry) => entry.method === "start"), false);
});

test("malformed branch UUID fails before branch authorization or domain access", async () => {
  const accessCalls = [];
  const harness = createRuntime();

  await withServer({
    boundary: allowedBoundary(accessCalls),
    runtime: harness.runtime
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/appointments?branchId=not-a-uuid`, {
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { message: "Appointment input is invalid." });
  });

  assert.deepEqual(accessCalls, ["application-user", "authorization"]);
  assert.equal(harness.calls.length, 0);
});

test("confirmed creation requires both appointment.create and appointment.confirm", async () => {
  const accessCalls = [];
  const harness = createRuntime();

  await withServer({
    boundary: allowedBoundary(accessCalls, { denyPermission: "appointment.confirm" }),
    runtime: harness.runtime
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/appointments`, {
      method: "POST",
      headers: { Authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({
        patientId,
        branchId: branchA,
        dentistUserId: dentistId,
        appointmentDate: "2026-10-22",
        appointmentTime: "10:00",
        durationMinutes: 30
      })
    });
    assert.equal(response.status, 403);
  });

  assert.ok(accessCalls.includes(`branch:appointment.create:${branchA}`));
  assert.ok(accessCalls.includes(`branch:appointment.confirm:${branchA}`));
  assert.equal(harness.calls.some((entry) => entry.method === "create"), false);
});

test("slot conflicts are exposed as safe 409 without persistence details", async () => {
  const accessCalls = [];
  const harness = createRuntime({
    async createAppointment() {
      throw new AppointmentDomainError("APPOINTMENT_SLOT_CONFLICT", [
        "postgresql://secret.example/internal"
      ]);
    }
  });

  await withServer({
    boundary: allowedBoundary(accessCalls),
    runtime: harness.runtime
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/appointments`, {
      method: "POST",
      headers: { Authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({
        patientId,
        branchId: branchA,
        dentistUserId: dentistId,
        appointmentDate: "2026-10-22",
        appointmentTime: "10:00",
        durationMinutes: 30
      })
    });
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.deepEqual(body, { message: "The selected Dentist is already booked for that time." });
    assert.doesNotMatch(JSON.stringify(body), /postgresql|secret/i);
  });
});

test("patient search and availability require narrow branch permissions", async () => {
  const accessCalls = [];
  const harness = createRuntime();

  await withServer({
    boundary: allowedBoundary(accessCalls),
    runtime: harness.runtime
  }, async (baseUrl) => {
    const search = await fetch(
      `${baseUrl}/api/appointments/patient-search?branchId=${branchA}&q=Fictional`,
      { headers: { Authorization: "Bearer token" } }
    );
    assert.equal(search.status, 200);

    const availability = await fetch(
      `${baseUrl}/api/appointments/availability?branchId=${branchA}&dentistUserId=${dentistId}&date=2026-10-22&time=10:00&durationMinutes=30`,
      { headers: { Authorization: "Bearer token" } }
    );
    assert.equal(availability.status, 200);
  });

  assert.ok(accessCalls.includes(`branch:appointment.patient_lookup:${branchA}`));
  assert.ok(accessCalls.includes(`branch:appointment.list:${branchA}`));
});

test("calendar endpoint is authenticated and branch-scoped with appointment.list", async () => {
  const accessCalls = [];
  const harness = createRuntime();

  await withServer({
    boundary: allowedBoundary(accessCalls),
    runtime: harness.runtime,
    calendar: true
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/calendar?branchId=${branchA}&date=2026-10-22`, {
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
  });

  assert.deepEqual(accessCalls, [
    "application-user",
    "authorization",
    `branch:appointment.list:${branchA}`
  ]);
});
