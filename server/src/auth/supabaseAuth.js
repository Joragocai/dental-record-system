import { createPublicKey, verify } from "node:crypto";

// Cloud APIs must validate identity cryptographically. Never trust a user ID
// supplied by a request header or a decoded but unverified JWT payload.
const allowedAlgorithms = new Map([
  ["RS256", { digest: "RSA-SHA256" }],
  ["ES256", { digest: "SHA256", dsaEncoding: "ieee-p1363" }]
]);
const issuerFor = (url) => String(url).replace(/\/$/, "") + "/auth/v1";
function decodePart(segment) {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) throw new Error("Invalid JWT encoding.");
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}
export function getSupabaseAuthConfig(env = process.env) {
  const url = String(env.SUPABASE_URL || "").trim();
  const userId = String(env.SUPABASE_ALLOWED_USER_ID || "").trim();
  if (!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(url)) throw new Error("SUPABASE_URL must be the HTTPS project URL.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw new Error("SUPABASE_ALLOWED_USER_ID must be the authorized Supabase Auth user UUID.");
  }
  return { issuer: issuerFor(url), allowedUserId: userId, projectUrl: url.replace(/\/$/, "") };
}
let cachedJwks;
let cachedUntil = 0;
async function loadKeys(config, fetchImpl = fetch) {
  if (cachedJwks && Date.now() < cachedUntil && cachedJwks.issuer === config.issuer) return cachedJwks.keys;
  const response = await fetchImpl(config.issuer + "/.well-known/jwks.json", { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Unable to obtain Supabase signing keys.");
  const { keys } = await response.json();
  if (!Array.isArray(keys)) throw new Error("Invalid Supabase JWKS response.");
  cachedJwks = { issuer: config.issuer, keys };
  cachedUntil = Date.now() + 60000;
  return keys;
}
export async function verifySupabaseToken(token, config, fetchImpl = fetch) {
  if (typeof token !== "string" || token.length > 12000) throw new Error("Missing access token.");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid access token.");
  const [headerEncoded, payloadEncoded, signatureEncoded] = parts;
  const header = decodePart(headerEncoded);
  const payload = decodePart(payloadEncoded);
  const algorithm = allowedAlgorithms.get(header.alg);
  if (!algorithm || !header.kid || !["at+jwt", "JWT", undefined].includes(header.typ)) throw new Error("Unsupported access token signing key.");
  const keys = await loadKeys(config, fetchImpl);
  const jwk = keys.find(key => key.kid === header.kid && key.alg === header.alg && key.use !== "enc");
  if (!jwk) throw new Error("Unrecognized Supabase signing key.");
  if (!(jwk.kty === "RSA" && header.alg === "RS256" || jwk.kty === "EC" && jwk.crv === "P-256" && header.alg === "ES256")) {
    throw new Error("JWT key type mismatch.");
  }
  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const signature = Buffer.from(signatureEncoded, "base64url");
  if (!verify(algorithm.digest, Buffer.from(headerEncoded + "." + payloadEncoded), { key: publicKey, ...(algorithm.dsaEncoding ? { dsaEncoding: algorithm.dsaEncoding } : {}) }, signature)) {
    throw new Error("JWT signature verification failed.");
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== config.issuer || payload.aud !== "authenticated" || payload.role !== "authenticated" ||
      typeof payload.exp !== "number" || payload.exp <= now || typeof payload.iat !== "number" || payload.iat > now + 60 ||
      payload.sub !== config.allowedUserId) throw new Error("Unauthorized Supabase session.");
  return { userId: payload.sub, expiresAt: payload.exp };
}
export function createSupabaseAuthMiddleware(config, verifier = verifySupabaseToken) {
  return async function requireSupabaseAuth(req, res, next) {
    const authorization = req.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) return res.status(401).json({ message: "Authentication required." });
    try {
      req.clinicAuth = await verifier(authorization.slice(7), config);
      next();
    } catch {
      return res.status(401).json({ message: "Authentication required or session expired." });
    }
  };
}
