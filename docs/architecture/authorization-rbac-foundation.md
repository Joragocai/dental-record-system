# V2 Authorization / RBAC Foundation

## Status

Phase 08E establishes the internal backend authorization policy foundation. It consumes the active `ApplicationUserContext` created in Phase 08D and resolves effective application permissions from PostgreSQL role mappings. It is intentionally not mounted on the current V1 clinic routes yet.

## Separation of Responsibilities

The security path is intentionally layered:

```text
Supabase Auth
  -> verified provider identity
  -> ApplicationUserService
  -> active clinic application user + roles + branch assignments
  -> AuthorizationService
  -> effective permission grants + branch policy decision
  -> future protected controller/domain service
```

Supabase/JWT role claims are authentication-provider metadata only and are never interpreted as clinic roles or permissions.

## Schema

Migration `0006_authorization_rbac_foundation.sql` adds:

- `permissions`
- `role_permissions`

Permission scope values are:

- `GLOBAL` — permission does not require a branch assignment.
- `BRANCH` — permission requires the target branch to be present in the user’s approved `user_branches` assignments.
- `OWN` — reserved for future patient ownership policies. Phase 08E denies OWN-scoped checks until an explicit ownership-aware evaluator exists.

The initial permission set is deliberately focused on the next security boundaries rather than attempting to model the entire final permission matrix in one migration.

## Initial Role Grants

### Patient

No permissions are granted in Phase 08E. Patient access requires explicit patient-account linking and ownership isolation, which is intentionally deferred.

### Personnel

Branch-scoped:

- `patient.list`
- `patient.read`
- `patient.create`
- `patient.demographics.update`
- `treatment.read`
- `attachment.read`
- `attachment.create`
- `attachment.download`

Personnel does not receive `treatment.internal_notes.read`, `treatment.finalize`, `attachment.update`, or `attachment.delete`.

### Dentist

Branch-scoped:

- `patient.list`
- `patient.read`
- `patient.create`
- `patient.demographics.update`
- `treatment.read`
- `treatment.internal_notes.read`
- `treatment.finalize`
- `attachment.read`
- `attachment.create`
- `attachment.download`
- `attachment.update`
- `attachment.delete`

### Clinic Administrator

Global:

- `user.read`
- `staff_account.create`
- `role_assignment.approve`

The Clinic Administrator role does not receive routine patient, treatment, or attachment access by itself. The clinic owner who is also the dentist receives clinical and attachment access because the same account separately holds the Dentist role.

### System Administrator

Global:

- `user.read`
- `role_definition.configure`

The System Administrator receives no routine patient, treatment, or attachment permission. Temporary support access remains a future separately controlled workflow.

## Effective Permission Union

A user may hold multiple application roles. The authorization repository resolves the distinct union of grants for all approved roles. This supports the owner-dentist account without creating a special combined role.

For example:

```text
DENTIST
+
CLINIC_ADMINISTRATOR
=
clinical Dentist grants
+
administrative Clinic Administrator grants
```

Explicit future safeguards can still restrict high-risk actions even when a role union contains a permission.

## Branch Enforcement

Operational BRANCH-scoped permissions do not bypass branch assignment automatically.

For a BRANCH-scoped permission, the requested resource/operation branch UUID must be present in the `ApplicationUserContext.branchIds` list established from `user_branches`.

A matching permission with the wrong branch is denied.

GLOBAL permissions do not require a branch assignment. This is the intended model for Clinic Administrator clinic-wide administrative/business authority. The Clinic Administrator role still does not gain clinical permissions by implication; an owner-dentist receives clinical permissions through the separate Dentist role, and those clinical permissions remain branch-scoped to the Dentist user's allowed branches.

`user_branches` represents flexible allowed/associated operating locations, not a permanent employee home-branch lock. Scheduling may place users together or separately at different branches and is handled independently of this membership table.

## Deny by Default

The authorization service denies when:

- the required permission is not granted;
- a BRANCH permission is checked without a branch-aware decision;
- the requested branch is malformed;
- the requested branch is not assigned to the user;
- an OWN-scoped permission is encountered before ownership evaluation exists.

An active application user with zero roles or zero permission grants remains a valid authenticated identity but receives no operational access.

## Express Authorization Boundary

Phase 08F adds a typed Express-facing composition layer:

```text
authenticate
  -> resolve active application user
  -> resolve effective authorization context
  -> require global or branch-scoped permission
  -> handler
```

The trusted values are stored only on the server in `res.locals.applicationUser` and `res.locals.authorization`. They are never accepted from browser claims or Supabase role metadata.

`GET /api/auth/access` is the only RBAC-protected probe added in this phase. It requires GLOBAL `user.read` and returns only `{ "authorized": true }`. `GET /api/auth/session` remains unchanged.

The default access runtime is lazy: importing `server/src/app.js` does not require `DATABASE_URL`. PostgreSQL configuration and repositories are created only when the RBAC access boundary is actually invoked.

Phase 08F still does not expose roles/permissions/branches to the frontend, protect legacy Patient/Treatment/Appointment routes, add user/role mutation APIs, introduce a Supabase service-role key, implement staff provisioning, implement patient ownership, or add audit/MFA.

## Staff Account Provisioning Dependency

The future Clinic Administrator staff-account workflow can depend on the `staff_account.create` permission established here. The intended later sequence is:

```text
verified Clinic Administrator identity
  -> application-user resolution
  -> authorization requires staff_account.create
  -> approved staff record/role/branch workflow
  -> backend-only managed-auth provisioning
  -> staff member activates and sets their own password
```

No privileged provider provisioning credential is introduced in Phase 08E.

## Phase 12 Appointment RBAC Extension

Migration `0011_appointment_workflow_redesign.sql` extends the existing deny-by-default RBAC model with BRANCH-scoped clinic appointment permissions.

Personnel receives:

- `appointment.list`
- `appointment.read`
- `appointment.patient_lookup`
- `appointment.create`
- `appointment.update`
- `appointment.confirm`
- `appointment.reschedule`
- `appointment.cancel`
- `appointment.check_in`
- `appointment.complete`
- `appointment.no_show`

Dentist receives all Personnel appointment permissions plus:

- `appointment.start`

Patient, Clinic Administrator, and System Administrator receive no Phase 12 appointment permissions. The owner-dentist receives appointment access only through the separate Dentist role, while Clinic Administrator permissions remain administrative/business permissions. Appointment permissions remain branch-scoped and therefore still require an allowed `user_branches` membership for the target appointment branch.

## Next Gates

Phase 08G now uses this authorization boundary to create pending Personnel/Dentist application records with approved branch assignments. The next security work is:

1. Backend-only managed-auth provisioning/invitation for an already approved pending staff record; keep provider admin credentials server-only and let the staff member establish their own password.
2. General user lifecycle/deactivation and separately controlled privileged-role workflows with self-elevation prevention.
3. Patient-account linking and OWN/patient isolation policy.
4. Append-only audit logging.
5. MFA and privileged reauthentication.
6. Protected Patient domain route integration only after the required security gates are proven.
