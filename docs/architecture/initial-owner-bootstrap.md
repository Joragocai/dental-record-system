# Initial Owner / Dentist Bootstrap (Phase 08J)

## Purpose

Phase 08J solves the first-administrator problem for a new Dental System environment. The normal staff-account workflow requires an authenticated Clinic Administrator, but a new environment initially has none. The bootstrap is therefore a one-time trusted server/CLI operation that creates the first clinic owner without adding a public bootstrap API.

## One-Time Role Assignment

The initial owner is one application user with exactly two separate role assignments:

- `DENTIST`
- `CLINIC_ADMINISTRATOR`

The bootstrap never grants `SYSTEM_ADMINISTRATOR`, `PERSONNEL`, or `PATIENT`. The doctor-owner uses one account; the backend continues to evaluate the two roles independently.

## Command Boundary

The bootstrap entrypoint is:

```bash
npm run bootstrap:owner
```

Two server-only maintenance helpers are also available after the initial owner record exists:

```bash
npm run bootstrap:owner:resend
npm run bootstrap:owner:status
```

`bootstrap:owner:resend` sends a fresh activation-recovery email only for the existing pending initial owner. It never creates another Clinic Administrator or changes the approved roles/branch assignment. `bootstrap:owner:status` is read-only and verifies the current owner status, exact roles, branch assignment, audit history, Supabase identity linkage, and the permanent bootstrap-disable condition.

These commands are server-side only. They use the normal PostgreSQL connection plus the server-only Supabase provisioning configuration. They never create an HTTP bootstrap route and never send the Supabase secret to the browser.

The CLI displays only safe branch identifiers/codes/names, asks for owner display name, owner email, branch UUID, and an explicit confirmation phrase, and prints only safe status messages.

## Permanent Disable Condition

Bootstrap is allowed only when no `user_roles` assignment exists for `CLINIC_ADMINISTRATOR`, regardless of account status. Once any Clinic Administrator assignment exists, all later bootstrap attempts fail before a provider invitation is sent.

This condition makes the bootstrap a first-environment initialization mechanism rather than a hidden administrator-creation path.

## Provider and Database Ordering

The flow is:

```text
preflight PostgreSQL checks
  -> generate application user UUID
  -> Supabase invitation
  -> receive provider UUID
  -> PostgreSQL transaction
       -> advisory transaction lock
       -> re-check no Clinic Administrator exists
       -> re-check email, branch, and role invariants
       -> insert pending app_user already linked to provider UUID
       -> assign DENTIST + CLINIC_ADMINISTRATOR
       -> assign branch
       -> append bootstrap audit
       -> append USER_INVITED audit
  -> commit
```

The external Supabase network call is intentionally outside the PostgreSQL transaction. The final transaction uses a dedicated PostgreSQL advisory transaction lock and repeats all security checks so concurrent bootstrap attempts cannot both become Clinic Administrators.

If the final database transaction fails after Supabase created the invited provider identity, the service attempts best-effort deletion of that just-created provider user. If cleanup also fails, it returns a reconciliation-required error and does not auto-link by email.

## Activation

Bootstrap does not activate clinic authorization. The new owner remains:

```text
status = pending
```

The owner follows the Phase 08I activation boundary:

1. Open the Supabase invitation email.
2. Establish the invite-authenticated browser session.
3. Choose their own password at `/activate-account`.
4. Call the authenticated activation endpoint.
5. The backend verifies provider UUID, email match, pending status, branch assignment, and the exact bootstrap role pair.
6. The application user becomes `active` and `USER_ACTIVATED` is appended.

If the original one-time invitation is consumed or expires before local activation completes, `npm run bootstrap:owner:resend` uses Supabase password recovery for the already-linked pending owner. The recovery flow does not recreate or relink the owner. It establishes a fresh authenticated provider session, allows the owner to set a password, and then reuses the same backend activation endpoint. A successful recovery send appends `USER_ACTIVATION_RECOVERY_SENT`.

The ordinary Clinic Administrator invitation endpoint remains limited to routine `PERSONNEL` / `DENTIST` targets. Phase 08J does not create a general privileged-role provisioning API.

## Audit Model

Successful bootstrap adds actorless server-CLI audit events because no application user exists yet to act as the first administrator:

- `INITIAL_OWNER_BOOTSTRAPPED` / `SUCCESS`
- `USER_INVITED` / `SUCCESS`
- `USER_ACTIVATION_RECOVERY_SENT` / `SUCCESS` when recovery is needed before activation

Their actor fields are `NULL`, while safe metadata records the server CLI source, pending status, branch, and exact dual-role bootstrap assignment. No email, password, token, secret, connection string, or Supabase response body is copied into audit metadata.

Safe bootstrap failures may append `INITIAL_OWNER_BOOTSTRAPPED` / `FAILURE` with a bounded internal reason code.

## Schema Impact

No new PostgreSQL migration is required. Phase 08J reuses:

- `app_users`
- `roles`
- `user_roles`
- `user_branches`
- `branches`
- `audit_events`

The existing nullable/unique `auth_user_id`, pending/active lifecycle, many-to-many roles, branch memberships, and actor-nullable audit schema already support the bootstrap safely.

## Remaining Gates

Phase 08J does not make the application production-ready. Important remaining work includes MFA/privileged reauthentication, privileged-role lifecycle controls, System Administrator bootstrap/provisioning policy, patient ownership/linking, protected clinical route cutover, private storage, staging, and end-to-end/security verification.
