# Local PostgreSQL preview

Use the `feature/single-clinic-cloud` branch. This preview does **not** modify the SQLite demo, disposable PostgreSQL tests, or hosted Supabase database/storage.

## Start

From `~/projects/dental-presentation`:

```bash
npm run dev:postgres
```

Open **http://127.0.0.1:5174** and sign in using the previously configured single Supabase Auth account. The frontend calls the PostgreSQL cloud API at `127.0.0.1:3003/api`. Do **not** use the old SQLite port `5173` for this preview.

The launcher derives credentials from `server/.env`, but switches the database name from the disposable `dental_presentation_test` to `dental_presentation_local`. It uses the Auth URL and allowlisted user UUID from `server/.env.local`, and browser-safe Auth settings from `client/.env.local`. It never connects to hosted PostgreSQL for clinical records.

## Isolated Demo Tools

A dedicated database guard was enabled **only** in `dental_presentation_local` after verifying the database was empty. Demo Fill creates fictional patients, treatments, appointments, ledger entries and attachments. Reset clears only this isolated local preview. The local private attachment files live in ignored `data/postgres-private-files/`; they are not written to Supabase Storage. The buttons are hidden before sign-in.

**Never** add real patient data to this demo database: the demo Reset clears all records within this explicitly isolated preview database. Do not enable the same guard in other databases.

## Other modes

- `npm run dev`: original SQLite clean mode, port 5173
- `npm run dev:demo`: original SQLite demo mode, port 5173
- `npm run dev:postgres`: PostgreSQL local preview, port 5174

These modes have separate data. Never run two frontend processes on the same port. Stop via Ctrl+C.

The backend runs local PostgreSQL on port 3003 and uses real Supabase Auth for login. To validate remote Auth you must have internet connectivity. Do not move private backend keys to client/Vite variables.

## Status

All five PostgreSQL migrations applied locally, frontend build passed, targeted tests passed and preview startup was verified. Live browser sign-in was not tested. Hosted migrations/deployment were not performed.
