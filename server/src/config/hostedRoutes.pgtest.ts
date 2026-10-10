import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

// Load the staging app in this test process before legacy routes are ever imported.
process.env.DENTAL_SERVER_ENV = "staging";
process.env.CORS_ALLOWED_ORIGINS = "https://stage.example.test";
const { default: app } = await import("../app.js");

test("staging serves only safe health and protected V2 routes", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });

    for (const path of ["/api/runtime/status", "/api/dashboard/summary", "/api/patients", "/api/treatments", "/api/export", "/api/backup"]) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 404, `${path} must not be reachable in staging`);
    }

    for (const path of ["/api/appointments", "/api/calendar", "/api/notifications"]) {
      const response = await fetch(`${base}${path}?branchId=44444444-4444-4444-8444-444444444444`);
      assert.equal(response.status, 401, `${path} must require authentication in staging`);
    }

    for (const path of ["/api/patient-enrollments", "/api/patient-enrollments/11111111-1111-4111-8111-111111111111/invite", "/api/patient-portal/activate", "/api/payments", "/api/payments/11111111-1111-4111-8111-111111111111/reverse", "/api/refunds", "/api/finance-operations/expenses", "/api/finance-operations/suppliers", "/api/finance-operations/accounts-payable", "/api/finance/opening-cash", "/api/finance/daily-closings", "/api/finance/daily-closings/11111111-1111-4111-8111-111111111111/approve", "/api/finance-operations/receivables/followups", "/api/me/account/deactivate", "/api/me/documents/11111111-1111-4111-8111-111111111111/download-url", "/api/me/appointment-requests", "/api/me/appointments/11111111-1111-4111-8111-111111111111/cancel-request", "/api/me/appointments/11111111-1111-4111-8111-111111111111/reschedule-request", "/api/patient-appointment-reviews/11111111-1111-4111-8111-111111111111/decision"]) {
      const denied = await fetch(base + path, {method:"POST",headers:{"content-type":"application/json"},body:"{}"});
      assert.equal(denied.status,401,path + " must reject anonymous callers");
    }

    for (const path of ["/api/me/balance", "/api/me/payments", "/api/finance/daily-summary?branchId=44444444-4444-4444-8444-444444444444&businessDate=2026-10-10", "/api/me/patient-profile", "/api/me/documents", "/api/me/appointments", "/api/me/appointment-branches", "/api/patient-appointment-reviews?branchId=44444444-4444-4444-8444-444444444444"]) {
      const response=await fetch(base+path);
      assert.equal(response.status,401,path+" must authenticate");
    }

    const session = await fetch(`${base}/api/auth/session`);
    assert.equal(session.status, 401);

    const preflight = await fetch(`${base}/api/auth/session`, {
      method: "OPTIONS",
      headers: { Origin: "https://stage.example.test", "Access-Control-Request-Method": "GET" }
    });
    assert.equal(preflight.headers.get("access-control-allow-origin"), "https://stage.example.test");

    const disallowed = await fetch(`${base}/api/health`, { headers: { Origin: "https://unapproved.example.test" } });
    assert.equal(disallowed.status, 403);
    assert.notEqual(disallowed.headers.get("access-control-allow-origin"), "https://unapproved.example.test");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
