# V2 Authentication Foundation

## Status

Phase 08A establishes a backend-first authentication foundation for future protected V2 routes. It is intentionally not wired into the current V1 route surface yet.

## Provider Boundary

The foundation uses Supabase Auth access tokens but keeps provider-specific verification behind a small `AccessTokenVerifier` interface. Future middleware and controllers should depend on the authenticated principal rather than on raw Supabase response objects.

The current verifier sends the bearer access token to Supabase Auth's authenticated user endpoint:

`GET {SUPABASE_URL}/auth/v1/user`

using the server-configured publishable key plus the caller's bearer token. The server does not manually verify JWT signatures and does not use the Supabase service-role key for routine request authentication.

## Authentication Principal

The trusted internal principal is intentionally minimal:

- `subject`: verified Supabase user UUID
- `email`: verified provider email when present
- `audience`: expected JWT audience
- `provider`: `supabase`

Supabase/Postgres JWT fields such as `role` are not interpreted as clinic application roles. Clinic roles and permissions belong to the separate authorization/RBAC phase.

## Security Properties

- Authorization headers must use a strict `Bearer <token>` shape.
- Missing and malformed credentials are distinguished without echoing token content.
- Provider responses are validated at runtime before identity fields are trusted.
- Audience mismatches are rejected.
- Invalid tokens map to a safe authentication error.
- Provider outages and malformed provider responses map to safe typed errors rather than exposing response bodies, URLs with secrets, tokens, or driver/network details.
- Authentication configuration is loaded lazily. Importing the new auth modules does not make the existing V1 application require Supabase configuration.
- HTTPS is required for remote Supabase URLs; HTTP is accepted only for localhost/loopback development targets.
- Request verification uses a finite timeout.

## Configuration

Server-only placeholders are documented in `.env.example`:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=replace_with_publishable_key
AUTH_JWT_AUDIENCE=authenticated
AUTH_REQUEST_TIMEOUT_MS=5000
```

Do not place the service-role key in browser code or use it for normal bearer-token verification.

## Current Runtime State

No existing route is protected by this foundation yet. `server/src/app.js` and the current V1 route modules remain unchanged so the existing local application continues to work while the security layers are built incrementally.

This means the current V1 HTTP surface is still unauthenticated and must not be exposed publicly or used as a production cloud API.

## Next Gates

Before the Patient PostgreSQL domain or other V2 modules are exposed through protected HTTP routes, the project still needs:

1. Express authentication middleware that uses this authentication service.
2. A protected V2 route/controller test surface to verify 401/503 handling without cutting over V1 routes.
3. Staff invitation and patient activation flows when explicitly approved.
4. Authorization/RBAC, branch enforcement, and patient ownership checks.
5. Append-only audit logging for sensitive authentication and Patient activity.
6. MFA and reauthentication requirements for privileged roles.
7. End-to-end tests and production configuration review.
