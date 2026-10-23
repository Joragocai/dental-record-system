import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, randomUUID } from "node:crypto";
import { getSupabaseAuthConfig, verifySupabaseToken, createSupabaseAuthMiddleware } from "./supabaseAuth.js";

const projectUrl = "https://demo-example.supabase.co";
const userId = randomUUID();
const otherUser = randomUUID();
const config = getSupabaseAuthConfig({ SUPABASE_URL: projectUrl, SUPABASE_ALLOWED_USER_ID: userId });
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key", use: "sig", alg: "ES256" };
const fakeFetch = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
function token(overrides = {}, headerOverrides = {}) {
  const header = Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256", kid: "test-key", ...headerOverrides })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const claims = Buffer.from(JSON.stringify({
    iss: config.issuer, sub: userId, aud: "authenticated", role: "authenticated",
    iat: now, exp: now + 900, ...overrides
  })).toString("base64url");
  const signature = sign("SHA256", Buffer.from(header + "." + claims), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return [header, claims, signature].join(".");
}
test("valid authorized Supabase ES256 JWT passes cryptographic verification", async () => {
  const result = await verifySupabaseToken(token(), config, fakeFetch);
  assert.equal(result.userId, userId);
});
test("reject expired, wrong-user, wrong-audience, invalid-signature and unsigned tokens", async () => {
  await assert.rejects(verifySupabaseToken(token({ sub: otherUser }), config, fakeFetch), /Unauthorized/);
  await assert.rejects(verifySupabaseToken(token({ exp: 1 }), config, fakeFetch), /Unauthorized/);
  await assert.rejects(verifySupabaseToken(token({ aud: "anon" }), config, fakeFetch), /Unauthorized/);
  const jwt = token();
  await assert.rejects(verifySupabaseToken(jwt.slice(0,-2) + "xx", config, fakeFetch), /signature/);
  await assert.rejects(verifySupabaseToken(token({}, { alg: "none" }), config, fakeFetch), /Unsupported/);
});
test("middleware denies missing bearer headers and passes verified authorization", async () => {
  const middleware = createSupabaseAuthMiddleware(config, async () => ({ userId }));
  const output = {};
  const res = { status(value) { output.status = value; return this; }, json(value) { output.json = value; return this; } };
  await middleware({ get: () => null }, res, () => { output.next = true; });
  assert.equal(output.status, 401);
  const req = { get: name => name === "authorization" ? "Bearer a.b.c" : "" };
  await middleware(req, res, () => { output.next = true; });
  assert.equal(output.next, true);
  assert.equal(req.clinicAuth.userId, userId);
});
test("configuration refuses missing authorized user", () => {
  assert.throws(() => getSupabaseAuthConfig({ SUPABASE_URL: projectUrl }), /ALLOWED_USER_ID/);
});
