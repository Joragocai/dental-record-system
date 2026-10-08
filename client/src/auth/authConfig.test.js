import assert from "node:assert/strict";
import test from "node:test";
import { readBrowserAuthenticationConfig } from "./authConfig.ts";

test("browser auth config stays non-fatal when Supabase settings are absent", () => {
  const result = readBrowserAuthenticationConfig({});
  assert.equal(result.configured, false);
  assert.equal(result.config, null);
  assert.equal(result.reason, "Browser authentication is not configured yet.");
});

test("browser auth config accepts public Supabase values and normalizes API base URL", () => {
  const result = readBrowserAuthenticationConfig({
    VITE_SUPABASE_URL: "https://example.supabase.co/",
    VITE_SUPABASE_PUBLISHABLE_KEY: " public-key ",
    VITE_API_BASE_URL: "http://127.0.0.1:3002/api/"
  });

  assert.equal(result.configured, true);
  assert.deepEqual(result.config, {
    supabaseUrl: "https://example.supabase.co",
    publishableKey: "public-key",
    apiBaseUrl: "http://127.0.0.1:3002/api"
  });
});

test("staging browser config fails closed without an HTTPS API URL", () => {
  const base = {
    VITE_APP_ENV: "staging",
    VITE_SUPABASE_URL: "https://staging.supabase.co",
    VITE_SUPABASE_PUBLISHABLE_KEY: "staging-public-key"
  };
  assert.equal(readBrowserAuthenticationConfig(base).configured, false);
  assert.equal(readBrowserAuthenticationConfig({ ...base, VITE_API_BASE_URL: "http://localhost:3002/api" }).configured, false);
  assert.equal(readBrowserAuthenticationConfig({ ...base, VITE_API_BASE_URL: "https://api.example.test/other" }).configured, false);
  const result = readBrowserAuthenticationConfig({ ...base, VITE_API_BASE_URL: "https://api.example.test/api/" });
  assert.equal(result.configured, true);
  assert.equal(result.config?.apiBaseUrl, "https://api.example.test/api");
});

test("browser auth config rejects insecure remote Supabase URLs", () => {
  const result = readBrowserAuthenticationConfig({
    VITE_SUPABASE_URL: "http://example.com",
    VITE_SUPABASE_PUBLISHABLE_KEY: "public-key"
  });
  assert.equal(result.configured, false);
  assert.match(result.reason ?? "", /invalid/i);
});
