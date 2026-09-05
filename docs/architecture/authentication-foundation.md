# V2 Authentication Foundation

## Status

Phase 08A established the backend authentication foundation. Phase 08B now wires that foundation into Express through a typed authentication middleware and a single protected `GET /api/auth/session` boundary. Existing V1 clinic routes remain unchanged and unauthenticated.

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

## Express Boundary

Phase 08B adds `createAuthenticateMiddleware()`. It reads the Authorization header, delegates verification to `AuthenticationService`, stores the verified principal in `res.locals.auth`, and forwards safe typed failures to the existing Express error pipeline. Authentication failures with status 401 also set `WWW-Authenticate: Bearer`.

The only protected route introduced in this phase is:

`GET /api/auth/session`

A successful response exposes only `authenticated: true`, the verified user UUID, and the verified email when present. Provider internals, bearer tokens, clinic roles, permissions, and branch assignments are not returned.

## Client Session Boundary

Phase 08C adds a browser authentication/session foundation using the official Supabase JavaScript client. Browser configuration uses only public values:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=replace_with_publishable_key
VITE_API_BASE_URL=http://127.0.0.1:3002/api
```

The browser auth client uses `sessionStorage` for this initial staff-oriented foundation, subscribes to provider auth-state changes, and verifies every restored or newly signed-in session against the protected Express `GET /api/auth/session` endpoint before the React application treats the identity as authenticated.

The client introduces `/login`, `/forgot-password`, `/reset-password`, and `/auth/account`. Only `/auth/account` is a protected frontend route in this phase. Existing Dashboard, Patient, Treatment, Appointment, export, backup, attachment, settings, and print pages are intentionally not wrapped in a login gate because their current V1 backing APIs are still unauthenticated.

There is no public self-registration. Staff account creation is reserved for a later Clinic Administrator-controlled provisioning workflow after application-user and authorization foundations exist. Administrators will initiate staff creation, but staff members must establish their own permanent password through managed activation/recovery flows.

The password-recovery UI uses a generic completion message so it does not reveal whether an email address exists. Password replacement is allowed only during a provider recovery session; successful replacement ends the recovery state and returns the user to normal login.

No Supabase service-role key is introduced in Phase 08C. Real Supabase project setup can be completed later; absent browser configuration leaves the auth UI non-fatal and clearly marked as not configured.

## Current Runtime State

`server/src/app.js` mounts the protected `/api/auth` router and the client now has an authentication-only test surface, but all pre-existing V1 clinic routes remain unchanged and unauthenticated. Phases 08A–08C therefore establish identity verification, Express middleware, and browser session orchestration without prematurely cutting over Patient, Treatment, Appointment, export, backup, or other legacy routes.

The remaining unauthenticated V1 HTTP surface must not be treated as a production-ready public API.

## Next Gates

Before the Patient PostgreSQL domain or other sensitive V2 modules are exposed through protected HTTP routes, the project still needs:

1. Application-user identity/status records that link verified provider identities to clinic users.
2. Authorization/RBAC, branch enforcement, and patient ownership checks.
3. Clinic Administrator-managed staff account provisioning after authorization exists.
4. Append-only audit logging for sensitive authentication and Patient activity.
5. MFA and reauthentication requirements for privileged roles.
6. Protected controller/route integration for selected V2 domains after authorization prerequisites exist.
7. End-to-end tests, real Supabase environment validation, and production configuration review.
