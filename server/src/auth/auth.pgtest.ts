import assert from "node:assert/strict";
import test from "node:test";
import { buildAuthenticationConfig } from "./authConfig.js";
import { AuthenticationError } from "./authErrors.js";
import { createAuthenticationService } from "./authService.js";
import { createSupabaseAccessTokenVerifier, type AccessTokenVerifier } from "./authVerifier.js";
import { parseBearerToken } from "./bearerToken.js";

const baseConfig = {
  supabaseUrl: "https://example.supabase.co",
  publishableKey: "sb_publishable_example",
  expectedAudience: "authenticated",
  requestTimeoutMs: 5000
};

function assertAuthError(error: unknown, code: AuthenticationError["code"]): boolean {
  return error instanceof AuthenticationError && error.code === code;
}

test("authentication config parses server-only Supabase settings with safe defaults", () => {
  const config = buildAuthenticationConfig({
    SUPABASE_URL: "https://example.supabase.co/",
    SUPABASE_PUBLISHABLE_KEY: " sb_publishable_example ",
    AUTH_JWT_AUDIENCE: "authenticated"
  });

  assert.deepEqual(config, baseConfig);
});

test("authentication config rejects missing or unsafe provider configuration", () => {
  assert.throws(() => buildAuthenticationConfig({}), (error) => assertAuthError(error, "AUTH_CONFIG_INVALID"));
  assert.throws(
    () =>
      buildAuthenticationConfig({
        SUPABASE_URL: "http://example.com",
        SUPABASE_PUBLISHABLE_KEY: "public-key"
      }),
    (error) => assertAuthError(error, "AUTH_CONFIG_INVALID")
  );
});

test("bearer parser distinguishes missing and malformed credentials without exposing token content", () => {
  assert.throws(() => parseBearerToken(undefined), (error) => assertAuthError(error, "CREDENTIALS_MISSING"));
  assert.throws(() => parseBearerToken("Basic abc"), (error) => assertAuthError(error, "CREDENTIALS_MALFORMED"));
  assert.throws(() => parseBearerToken("Bearer secret token"), (error) => {
    assert.equal(assertAuthError(error, "CREDENTIALS_MALFORMED"), true);
    assert.doesNotMatch((error as Error).message, /secret|token/i);
    return true;
  });
  assert.equal(parseBearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
});

test("Supabase verifier maps a verified user to a minimal authenticated principal", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const verifier = createSupabaseAccessTokenVerifier(baseConfig, async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(
      JSON.stringify({
        id: "22222222-2222-4222-8222-222222222222",
        email: "fictional@example.test",
        aud: "authenticated",
        role: "authenticated",
        app_metadata: { clinic_role: "Dentist" }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });

  const principal = await verifier.verifyAccessToken("fictional-access-token");

  assert.deepEqual(principal, {
    subject: "22222222-2222-4222-8222-222222222222",
    email: "fictional@example.test",
    audience: "authenticated",
    provider: "supabase"
  });
  assert.equal(requestUrl, "https://example.supabase.co/auth/v1/user");
  assert.equal(new Headers(requestInit?.headers).get("apikey"), "sb_publishable_example");
  assert.equal(new Headers(requestInit?.headers).get("authorization"), "Bearer fictional-access-token");
});

test("Supabase verifier rejects invalid credentials and audience mismatch with safe typed errors", async () => {
  const invalidVerifier = createSupabaseAccessTokenVerifier(baseConfig, async () => new Response("{}", { status: 401 }));
  await assert.rejects(invalidVerifier.verifyAccessToken("bad-token"), (error) => assertAuthError(error, "TOKEN_INVALID"));

  const wrongAudienceVerifier = createSupabaseAccessTokenVerifier(
    baseConfig,
    async () =>
      new Response(JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", aud: "other" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
  );
  await assert.rejects(
    wrongAudienceVerifier.verifyAccessToken("bad-audience-token"),
    (error) => assertAuthError(error, "AUDIENCE_MISMATCH")
  );
});

test("Supabase verifier hides provider failures and malformed provider responses", async () => {
  const unavailable = createSupabaseAccessTokenVerifier(baseConfig, async () => {
    throw new Error("network failure containing https://secret.example/token=abc");
  });
  await assert.rejects(unavailable.verifyAccessToken("secret-token"), (error) => {
    assert.equal(assertAuthError(error, "PROVIDER_UNAVAILABLE"), true);
    assert.doesNotMatch((error as Error).message, /secret|token=abc|secret-token/i);
    return true;
  });

  const malformed = createSupabaseAccessTokenVerifier(
    baseConfig,
    async () => new Response(JSON.stringify({ id: "not-a-uuid", aud: "authenticated" }), { status: 200 })
  );
  await assert.rejects(malformed.verifyAccessToken("another-secret"), (error) =>
    assertAuthError(error, "PROVIDER_RESPONSE_INVALID")
  );
});

test("authentication service remains lazy and delegates only the parsed token to its verifier", async () => {
  const tokens: string[] = [];
  const verifier: AccessTokenVerifier = {
    async verifyAccessToken(accessToken) {
      tokens.push(accessToken);
      return {
        subject: "22222222-2222-4222-8222-222222222222",
        email: null,
        audience: "authenticated",
        provider: "supabase"
      };
    }
  };
  const service = createAuthenticationService({ verifier, config: baseConfig });

  const principal = await service.authenticateAuthorizationHeader("Bearer abc.def");
  assert.equal(principal.subject, "22222222-2222-4222-8222-222222222222");
  assert.deepEqual(tokens, ["abc.def"]);

  const lazyService = createAuthenticationService();
  await assert.rejects(
    lazyService.authenticateAuthorizationHeader(undefined),
    (error) => assertAuthError(error, "CREDENTIALS_MISSING")
  );
});
