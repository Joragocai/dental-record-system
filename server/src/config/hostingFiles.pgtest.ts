import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("Vercel serves only the approved hosted authentication SPA routes", () => {
  const file = readFileSync(path.join(repositoryRoot, "client/vercel.json"), "utf8");
  const config = JSON.parse(file) as {
    rewrites?: Array<{ source: string; destination: string }>;
  };
  const sources = (config.rewrites ?? []).map((rewrite) => {
    assert.equal(rewrite.destination, "/index.html");
    return rewrite.source;
  });
  assert.deepEqual(sources, [
    "/login", "/forgot-password", "/reset-password", "/activate-account", "/activate-patient-account", "/auth/account", "/dashboard", "/personnel-dashboard", "/dentist-dashboard", "/clinic-administrator-dashboard", "/clinic-finance", "/patient-finance", "/patient-documents", "/clinic-patient-requests", "/patient-appointments", "/patient-portal", "/appointments", "/notifications"
  ]);
  assert.equal(file.includes("SUPABASE_SECRET_KEY"), false);
  assert.equal(file.includes("DATABASE_URL"), false);
});

test("hosted appointment, calendar, and notification routes share one access boundary", () => {
  const file = readFileSync(path.join(repositoryRoot, "server/src/app.js"), "utf8");
  assert.equal((file.match(/const hostedAccessBoundary = createAccessBoundary\(\);/g) ?? []).length, 1);
  assert.equal((file.match(/const appointmentRuntime = createAppointmentRuntime\(\);/g) ?? []).length, 1);
  assert.ok(file.includes("createAppointmentsRouter(undefined, hostedAccessBoundary, appointmentRuntime)"));
  assert.ok(file.includes("createAppointmentCalendarRouter(undefined, hostedAccessBoundary, appointmentRuntime)"));
  assert.ok(file.includes("const notificationRuntime = createInAppNotificationRuntime();"));
  assert.ok(file.includes("createNotificationsRouter(undefined, hostedAccessBoundary, notificationRuntime)"));
});

test("Render staging blueprint remains manual, isolated, and secret-free", () => {
  const file = readFileSync(path.join(repositoryRoot, "render.yaml"), "utf8");
  for (const rule of [
    "branch: refactor/v2-cloud-migration",
    "startCommand: npm run start:hosted",
    "buildCommand: npm ci",
    "healthCheckPath: /api/health",
    "autoDeployTrigger: off",
    "name: dental-record-staging-api",
    "value: staging",
    "value: dental-attachments-staging",
    "value: /etc/secrets/dental-staging-ca.crt"
  ]) {
    assert.ok(file.includes(rule), `Missing Render staging rule: ${rule}`);
  }
  for (const secret of [
    "DATABASE_URL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY", "STAFF_INVITE_REDIRECT_URL", "CORS_ALLOWED_ORIGINS"
  ]) {
    assert.match(file, new RegExp(`- key: ${secret}\\s+sync: false`));
  }
  assert.equal(file.includes("postgresql://"), false);
  assert.equal(file.includes("sb_secret_"), false);
});
