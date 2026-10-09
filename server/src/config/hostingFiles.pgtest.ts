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
    "/login", "/forgot-password", "/reset-password", "/activate-account", "/auth/account", "/appointments"
  ]);
  assert.equal(file.includes("SUPABASE_SECRET_KEY"), false);
  assert.equal(file.includes("DATABASE_URL"), false);
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
