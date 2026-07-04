# Electronic Dental Record System

Local web app for one-laptop dental clinic use. This project replaces an Excel/VBA prototype with a proper React, Express, and SQLite workflow.

## Stack

- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js + Express
- Database: SQLite with Node built-in `node:sqlite`
- Excel export: `exceljs`
- Uploads: local filesystem storage

## Project Structure

```text
electronic_dental_record_system/
  client/
  server/
  data/
    dental.db
  uploads/
    patients/
    treatments/
  exports/
  backups/
  Start Dental System.bat
  Backup Database.bat
  README.md
```

## Windows Setup

1. Install Node.js.
2. Open Command Prompt in the project folder.
3. Run:

```bat
npm install
```

4. Start the local system with:

```bat
Start Dental System.bat
```

## Manual Commands

Backend only:

```bash
npm run dev:server
```

Frontend only:

```bash
npm run dev:client
```

Both together:

```bash
npm run dev
```

Backend URL: `http://127.0.0.1:3002`

Frontend URL: `http://localhost:5173`

## Local File Locations

- Database file: `data/dental.db`
- Patient uploads: `uploads/patients/`
- Treatment uploads: `uploads/treatments/`
- Excel exports: `exports/`
- Full system backups: `backups/`

## Backup

Use either option:

1. Open the app and use the `Backup` page.
2. Run:

```bat
Backup Database.bat
```

Each backup creates a timestamped folder in `backups/` and includes:

- `data/dental.db`
- `data/dental.db-shm` if present
- `data/dental.db-wal` if present
- `uploads/patients/`
- `uploads/treatments/`
- other upload subfolders under `uploads/`
- `exports/` if present

Backup is intended to protect both the database and uploaded files. Before any major system update, click `Create Backup` first. For real clinic use, copy the created backup folder to an external drive or cloud storage after backup completes.

## Database Creation

The SQLite database file is created automatically when the backend starts for the first time.

## Current Features

- Dashboard
- Patient CRUD
- Stronger patient and treatment validation on both client and server
- Patient ID generation with yearly reset
- Patient search with partial matching
- Treatment CRUD
- Treatment ID generation with yearly reset
- Treatment history filtered by selected patient
- Expanded print-friendly patient, treatment, and treatment history pages
- Excel export endpoints
- Local backup endpoint for database and uploaded files
- Local attachment storage and preview support
- Basic attachment upload forms on patient and treatment record pages
- Windows start and backup batch files

## API Endpoints

Patients:

- `GET /api/patients`
- `GET /api/patients/next-id`
- `GET /api/patients/search?q=`
- `GET /api/patients/:patientId`
- `POST /api/patients`
- `PUT /api/patients/:patientId`
- `GET /api/patients/:patientId/treatments`
- `GET /api/patients/:patientId/attachments`

Treatments:

- `GET /api/treatments`
- `GET /api/treatments/next-id`
- `GET /api/treatments/:treatmentId`
- `GET /api/treatments/:treatmentId/attachments`
- `POST /api/treatments`
- `PUT /api/treatments/:treatmentId`

Attachments:

- `POST /api/attachments`
- `GET /uploads/...`

Exports:

- `GET /api/export/patients`
- `GET /api/export/treatments`
- `GET /api/export/patients/:patientId/full-record`
- `GET /api/export/patients/:patientId/treatments`

Backup:

- `POST /api/backup`

## Test Flow

### Add a patient

1. Run `Start Dental System.bat` or start backend and frontend manually.
2. Open `http://127.0.0.1:5173`.
3. Go to `New Patient`.
4. Confirm the generated Patient ID looks like `P-2026-0001`.
5. Fill in required fields and save.

### Add a treatment

1. Open the saved patient record.
2. Click `Add Treatment`.
3. Confirm the patient is selected.
4. Fill in required treatment fields and save.
5. Confirm the generated Treatment ID looks like `T-2026-0001`.

### Test patient search

1. Open `Patient Search`.
2. Search by last name, first name, Patient ID, or mobile number.
3. Try a partial value such as `Del`.
4. Open the matching result.

### Test print buttons

1. Open a patient record and click `Print Patient Record`.
2. Open a treatment record and click `Print Treatment`.
3. Open a patient treatment history page and click `Print Full History`.
4. Confirm the patient printout shows full patient, medical, allergy, checklist, and alert sections.
5. Confirm the treatment printout shows patient details, amounts, balance, remarks, and attachment previews when available.

### Test Excel export

1. From a patient record, click `Export Full Record` or `Export Treatments`.
2. Confirm the exported files are saved in the local `exports/` folder with timestamped filenames.

### Test backup

1. Open the `Backup` page.
2. Click `Create Backup`.
3. Confirm a new folder appears in `backups/`.
4. Confirm that folder contains `data/` and `uploads/`.
5. Confirm patient and treatment attachment files are present inside the backup copy.

## Notes

- The app is localhost-only.
- SQLite remains a local file at `data/dental.db`.
- The database contains patient and treatment records.
- The `uploads/` folder contains patient and treatment images/attachments.
- Restore is not implemented yet.
- Authentication is not implemented yet.
