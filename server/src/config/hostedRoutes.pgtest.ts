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

    for (const path of ["/api/runtime/status", "/api/dashboard/summary", "/api/patients", "/api/treatments", "/api/appointments", "/api/export", "/api/backup"]) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 404, `${path} must not be reachable in staging`);
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
