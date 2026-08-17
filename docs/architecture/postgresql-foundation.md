# PostgreSQL Foundation

## Purpose

This document describes the PostgreSQL foundation added for V2 while the V1
SQLite runtime remains active.

The PostgreSQL foundation is intentionally limited to:

- typed server-only configuration;
- lazy pool creation and shutdown;
- deterministic version-controlled migrations;
- migration bookkeeping and status reporting;
- test-database safety checks.

It does not migrate current patient, treatment, appointment, attachment,
finance, auth, audit, storage, or portal workflows.

## Coexistence Strategy

- V1 continues to run from `server/src/db/database.js` and the existing SQLite
  filesystem/runtime paths.
- PostgreSQL does not auto-connect on normal server startup.
- PostgreSQL migrations run only through explicit commands.
- No dual-write or background sync is introduced.
- Future V2 slices should consume PostgreSQL through focused TypeScript modules
  without replacing the V1 SQLite runtime until retirement gates are met.

## Configuration

Environment variables:

- `DENTAL_SERVER_ENV`: `local`, `test`, `staging`, or `production`
- `DATABASE_URL`: primary PostgreSQL connection string
- `TEST_DATABASE_URL`: separate PostgreSQL URL for disposable integration checks
- `DATABASE_SSL_MODE`: `disable`, `require`, or `no-verify`
- `PGPOOL_MAX`
- `PGPOOL_IDLE_TIMEOUT_MS`
- `PGPOOL_CONNECTION_TIMEOUT_MS`
- `PGSTATEMENT_TIMEOUT_MS`
- `PGAPP_NAME`
- `ALLOW_PRODUCTION_DB_COMMANDS`

The foundation validates configuration before use and only logs sanitized
target details such as environment, host, database name, and SSL mode.
Credentials are never printed.

## Commands

- `npm run db:migrate`
- `npm run db:migrate:status`
- `npm run test:postgres:foundation`

Normal server startup does not run migrations automatically.

## Migration Mechanism

- Migration files live under `server/src/postgres/migrations/`.
- Files use ordered numeric prefixes such as `0001_v2_foundation_probe.sql`.
- Applied migrations are tracked in `drs_schema_migrations`.
- Applied migration files are treated as immutable.
- If an applied migration's checksum no longer matches the file on disk, the
  runner fails instead of silently continuing.
- Failed migrations are not marked applied.

## Test Safety

- PostgreSQL integration checks must use `DENTAL_SERVER_ENV=test`.
- `TEST_DATABASE_URL` must differ from `DATABASE_URL`.
- Test targets must use a clearly local host such as `127.0.0.1`, `localhost`,
  or `::1`.
- Test database names must contain `test`.
- Destructive PostgreSQL test setup must not run if those safety rules fail.

If no safe disposable PostgreSQL database is configured, unit tests for the
foundation still run and PostgreSQL integration checks should be reported as
not run.
