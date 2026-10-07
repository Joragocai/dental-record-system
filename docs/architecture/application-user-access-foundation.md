# Application User Identity, Status, Roles, and Branch Foundation

## Status

Phase 08D establishes the PostgreSQL-backed clinic application-user identity model that future authorization middleware will consume. It does not yet enforce permissions, protect legacy clinic routes, provision Supabase users, or expose role-management APIs.

## Identity Boundary

Authentication and clinic access remain separate concerns:

```text
Supabase Auth identity
        ↓
verified auth UUID
        ↓
app_users.auth_user_id
        ↓
application user status
        ↓
application roles + branch assignments
        ↓
future authorization policy
```

A valid Supabase token proves provider identity only. Provider/JWT `role` values are never treated as clinic roles.

## Tables

### `app_users`

Stores the clinic-side application account record.

Key properties:

- UUID primary key.
- Nullable, unique `auth_user_id` so a pending clinic staff record may exist before technical Supabase provisioning.
- Case-insensitive unique email identity.
- Non-blank display name.
- Lifecycle status limited to `pending`, `active`, `suspended`, or `deactivated`.
- No password, access-token, refresh-token, or service-role credential columns.

### `roles`

Contains exactly the five approved machine roles:

- `PATIENT`
- `PERSONNEL`
- `DENTIST`
- `CLINIC_ADMINISTRATOR`
- `SYSTEM_ADMINISTRATOR`

The current owner-dentist is represented by one application user assigned both `DENTIST` and `CLINIC_ADMINISTRATOR`; duplicate accounts are not required.

`SYSTEM_ADMINISTRATOR` remains a separate technical role and gains no clinical or business role implicitly.

### `user_roles`

Many-to-many application-user role assignments. The composite primary key prevents duplicate role assignment.

### `user_branches`

Many-to-many application-user branch assignments using the existing normalized `branches` table. The composite primary key prevents duplicate branch assignment.

A Dentist or Personnel user may be assigned to multiple branches. These rows represent allowed/associated operating locations and must not be interpreted as a permanent home-branch lock. Actual schedules and transaction locations are separate concerns.

Clinic Administrator administrative/business authority is clinic-wide through GLOBAL permissions where appropriate; the administrator does not need a branch assignment merely to exercise a clinic-wide administrative permission.

Phase 08D stores branch assignments but does not yet enforce them against records or routes.

## Repository and Service Boundaries

`ApplicationUserRepository` performs parameterized PostgreSQL reads for:

- application user by verified auth UUID;
- application user by application UUID;
- role codes for one user;
- branch UUIDs for one user.

Database rows are runtime-validated before they are returned as trusted application records.

`ApplicationUserService` resolves a verified provider UUID into an internal `ApplicationUserContext`:

```text
userId
authUserId
email
displayName
status
roles[]
branchIds[]
```

The service intentionally does not decide permissions yet.

## Status Behavior

- Unknown auth UUID → `APPLICATION_USER_NOT_FOUND`.
- `pending` → `APPLICATION_USER_PENDING`.
- `suspended` or `deactivated` → `APPLICATION_USER_INACTIVE`.
- `active` with no roles → valid application identity with an empty role set; future authorization must deny by default.
- Multiple roles and multiple branches are preserved deterministically.

Malformed provider UUIDs are rejected before repository access. Persistence failures are translated into safe domain errors without leaking connection strings, SQL-driver details, credentials, or patient data.

## Current Runtime State

Phase 08D does not change `GET /api/auth/session` and does not expose roles or branches to the browser. Existing V1 clinic routes remain intentionally unchanged and unauthenticated until authorization, audit, and protected-route replacement gates are complete.

No Supabase service-role key is required for this phase. Fictional auth UUIDs are sufficient for local PostgreSQL tests.

## Next Gates

1. Build authorization/RBAC policy definitions and branch enforcement using this application-user context.
2. Add protected authorization middleware that composes authentication with application-user resolution.
3. Add Clinic Administrator-controlled staff provisioning only after the authorization rules are enforced.
4. Add append-only audit events for account, role, and security changes.
5. Add MFA and privileged reauthentication for Clinic Administrator and System Administrator operations.
6. Integrate protected V2 domain routes only after the applicable authorization and audit gates are ready.
