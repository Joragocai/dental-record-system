# V2 Private Storage Foundation

## Status

Phase 10 replaces the active attachment runtime on `refactor/v2-cloud-migration` with private Supabase Storage plus PostgreSQL metadata. Migration `0010_private_attachment_storage.sql` is applied to the development Supabase PostgreSQL database, the development bucket `dental-attachments-dev` is verified private, and a fictional PDF completed the live upload/verify/download/delete lifecycle.

The stable V1 implementation remains preserved separately under the `v1-local-stable` Git reference.

## Security Boundary

The active V2 attachment path is:

```text
authenticated browser
  -> active application user
  -> RBAC / branch check
  -> PostgreSQL attachment metadata
  -> exact random private object key
  -> signed Supabase Storage authorization
```

The V2 server no longer exposes unrestricted `/uploads` static serving.

Legacy anonymous attachment upload/download/delete routes are retired from the V2 runtime. Remaining local-upload references belong to preserved V1/demo/export code and are not used by the protected V2 attachment API.

## PostgreSQL Model

Migration `0010` adds `attachments` with UUID identity and:

- patient UUID;
- optional treatment UUID;
- branch UUID;
- category;
- original filename;
- random object key;
- declared MIME and byte size;
- SHA-256 after completion;
- uploader application-user UUID;
- uploaded/deleted timestamps;
- patient-visible flag defaulting to false;
- description;
- lifecycle status.

Lifecycle states are:

```text
pending -> uploaded -> deleting -> deleted
   |
   +-> failed
```

Deleted rows remain in PostgreSQL so attachment history is preserved.

A composite foreign key enforces that a treatment attachment's treatment, patient, and branch agree with the treatment row. Patient-level attachments are allowed to record the operational branch receiving the document; `patients.branch_id` remains registration/origin context rather than permanent ownership.

## Attachment Permissions

All attachment permissions are BRANCH-scoped:

- `attachment.read`
- `attachment.create`
- `attachment.download`
- `attachment.update`
- `attachment.delete`

Initial grants:

- Personnel: read, create, download
- Dentist: read, create, download, update, delete
- Clinic Administrator: none through that role alone
- System Administrator: none
- Patient: none in Phase 10

The owner-dentist receives attachment access through the separate Dentist role, not through Clinic Administrator.

## Private Storage Configuration

Server-only configuration:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_ATTACHMENT_BUCKET`
- `ATTACHMENT_STORAGE_REQUEST_TIMEOUT_MS`
- `ATTACHMENT_DOWNLOAD_URL_TTL_SECONDS`

The Supabase secret never enters the browser bundle or API response.

The private bucket must:

- be private;
- use the approved 20 MB limit;
- use the approved MIME allowlist.

A maintenance command verifies or creates the development bucket:

```text
npm run bootstrap:attachments-storage
```

## Upload Authorization

The browser first calls:

```http
POST /api/attachments/upload-intent
```

The backend validates:

- patient UUID;
- optional treatment UUID;
- branch UUID;
- branch permission;
- patient existence;
- treatment/patient/branch relationship;
- category;
- original filename;
- MIME;
- declared size.

The server creates a pending PostgreSQL row and a random object key such as:

```text
attachments/<attachment-uuid>/<random-object-uuid>.pdf
```

No patient name, email, original filename, diagnosis, treatment description, or other PHI is embedded in the object key.

Supabase signed upload URLs currently use the provider-defined lifetime of approximately two hours. The application does not expose a fake shorter upload-TTL setting that the provider cannot enforce.

## Completion Validation

After direct private upload, the browser calls:

```http
POST /api/attachments/complete
```

The backend reads the exact private object and verifies:

- actual size matches declared size;
- size is within 20 MB;
- provider MIME does not conflict with declared MIME;
- file signature/content matches the declared type;
- SHA-256 is computed server-side.

Supported initial signatures:

- JPEG
- PNG
- WEBP
- PDF
- legacy DOC/OLE
- DOCX OOXML container
- conservative UTF-8 text validation

Invalid content is rejected, best-effort deleted from Storage, and the metadata row is marked failed. If cleanup itself fails, the service returns a reconciliation-required state instead of pretending the two systems were atomic.

## Download Authorization

Authorized users call:

```http
GET /api/attachments/:attachmentId/download-url
```

The backend returns a short-lived signed private URL for exactly one object.

The application records `ATTACHMENT_DOWNLOAD_URL_ISSUED`, not `ATTACHMENT_DOWNLOADED`, because URL issuance proves authorization but does not prove that the browser actually completed the transfer.

## Metadata Update And Delete

```http
PATCH /api/attachments/:attachmentId
DELETE /api/attachments/:attachmentId
```

Only category and description are mutable through the metadata update endpoint.

Delete transitions the row through `deleting` to `deleted`, removes the private Storage object, preserves the PostgreSQL row, and records the deleting actor/timestamp.

## Audit Events

Phase 10 adds:

- `ATTACHMENT_UPLOADED`
- `ATTACHMENT_VIEWED`
- `ATTACHMENT_DOWNLOAD_URL_ISSUED`
- `ATTACHMENT_METADATA_UPDATED`
- `ATTACHMENT_DELETED`

All HTTP-generated events use the trusted Phase 09 request UUID.

Audit metadata excludes signed URLs, upload tokens, Supabase secrets, object contents, raw provider errors, and full patient medical data.

## Client Cutover State

The active attachment upload component now uses the authenticated V2 signed-upload flow when it receives:

- authenticated browser session;
- V2 patient UUID;
- V2 branch UUID;
- optional V2 treatment UUID.

Legacy pages that still use readable/integer V1 identifiers fail closed for attachments. They do not fall back to anonymous multipart upload or local `/uploads` URLs.

Patient/treatment attachment listing endpoints remain deferred until the protected parent-domain route cutover. Repository/service methods for UUID-based listing already exist.

## Live Development Validation

The guarded command:

```text
ATTACHMENT_LIVE_VALIDATION=YES npm run validate:attachments:live
```

is restricted to the local development environment and uses fictional data only.

The completed live validation verified:

- private bucket policy;
- active Dentist attachment permission;
- cross-branch denial;
- no attachment permissions for restricted roles;
- signed private upload;
- PostgreSQL pending row;
- server-side signature and SHA-256 validation;
- uploaded state;
- bounded signed download;
- downloaded content equality;
- private object deletion;
- preserved soft-deleted metadata;
- correlated attachment audit events.

## Deferred

Phase 10 does not implement:

- Patient Portal attachment ownership/access;
- patient-visible publishing;
- camera capture/crop/rotate/retake UX;
- malware scanning;
- EXIF transformation;
- legacy-file migration;
- attachment backup/restore;
- production bucket rollout;
- broad Patient/Treatment route cutover.

Malware scanning and attachment backup/restore remain production-readiness dependencies.
