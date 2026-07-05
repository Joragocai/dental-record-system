# Dental Record System

Local web-based dental record system for one-computer or clinic-local use. It manages patient records, treatment records, attachments, printing, PDF download, Excel export, and full system backup.

This system replaces the earlier Excel/VBA approach with a React, Express, and SQLite workflow designed for local clinic operations.

## Stack

- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js + Express
- Database: SQLite using Node built-in `node:sqlite`
- Uploads: local filesystem storage
- Excel export: `exceljs`
- PDF download: `html2canvas` and `jsPDF`
- Local backup: database, uploads, and exports

## Project Structure

```text
dental-record-system/
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
2. Open Windows PowerShell in the project folder.
3. Run:

```powershell
npm install --include=optional
```

4. Start the app using either:

```powershell
Start Dental System.bat
```

or:

```powershell
npm run dev
```

Important:

- Do not run `npm install` in WSL/Linux for this Windows project because it can install Linux-specific native dependencies and break Windows runs.
- Do not run `Start Dental System.bat` and `npm run dev` at the same time because both use the same ports.
- If port `5173` is already in use, close the old running app first before starting again.

## Startup Behavior

- Backend URL: `http://127.0.0.1:3002`
- Frontend URL: `http://localhost:5173`

The system is intended for local use on the clinic computer. The frontend talks to the local backend, and the backend uses the local SQLite database at `data/dental.db`.

## Batch Files

### Start Dental System.bat

- Starts backend and frontend in separate command windows
- Opens `http://localhost:5173`
- Should remain inside the main project folder
- Intended to start the system from the project folder where the batch file is kept

### Backup Database.bat

- Creates a timestamped backup folder
- Backs up the database, uploads, and exports when present

## Local File Locations

- Database file: `data/dental.db`
- Patient uploads: `uploads/patients/`
- Treatment uploads: `uploads/treatments/`
- Excel exports: `exports/`
- Full system backups: `backups/`

## Current Features

- Dashboard
- New Patient
- Patient Search
- New Treatment
- Patient record view
- Patient update/edit
- Treatment record view
- Treatment update/edit
- Auto-generated Patient ID with yearly reset, example `P-2026-0001`
- Auto-generated Treatment ID with yearly reset, example `T-2026-0001`
- Patient search by Patient ID, name, or mobile number
- Medical history fields
- Medical condition checklist
- Medical Alert Summary
- Treatment amount validation
- Amount Charged, Amount Paid, and Balance
- Automatic balance calculation
- Patient-level attachments
- Treatment-level attachments
- Attachment categories
- Attachment preview
- Image preview modal
- Attachment download
- Attachment delete
- File type validation for attachments
- Print Patient Record
- Print Treatment Record
- Print Patient Treatment History
- Download PDF from print pages
- Excel exports
- Full system backup
- Subtle UI transitions/animations
- Local-only SQLite database

## Attachments

Patient-level attachments are stored in:

- `uploads/patients/`

Treatment-level attachments are stored in:

- `uploads/treatments/`

Allowed file types:

- `jpg`
- `jpeg`
- `png`
- `webp`
- `pdf`
- `doc`
- `docx`
- `txt`

Blocked file examples:

- `exe`
- `msi`
- `bat`
- `cmd`
- `sh`
- `js`
- `vbs`
- `ps1`
- `zip`
- `rar`
- `7z`
- unsupported application files

Attachment records are stored in the database, while uploaded files are stored in the `uploads/` folder. Both the database and the uploads folder must be backed up together.

## Backup

Backup protects:

- `data/dental.db`
- `data/dental.db-shm` if present
- `data/dental.db-wal` if present
- `uploads/patients/`
- `uploads/treatments/`
- other upload subfolders under `uploads/`
- `exports/` if present

Use either option:

1. Open the app and use the `Backup` page.
2. Run:

```powershell
Backup Database.bat
```

Each backup creates a timestamped folder in `backups/`.

Important:

- A backup is incomplete if it includes only the database but not the uploads folder.
- For real clinic use, copy the backup folder to an external drive, another computer, or secure cloud storage after backup completes.

## Print and PDF

Document-style print pages are available for:

- Patient Record
- Treatment Record
- Patient Treatment History

The print pages include:

- Back button
- Print button
- Download PDF button

Print and PDF output are designed for Letter paper with safe margins. Downloaded PDFs should not include the action buttons shown on screen.

## API Endpoints

### Patients

- `GET /api/patients`
- `GET /api/patients/next-id`
- `GET /api/patients/search?q=`
- `GET /api/patients/:patientId`
- `POST /api/patients`
- `PUT /api/patients/:patientId`
- `GET /api/patients/:patientId/treatments`
- `GET /api/patients/:patientId/attachments`

### Treatments

- `GET /api/treatments`
- `GET /api/treatments/next-id`
- `GET /api/treatments/:treatmentId`
- `GET /api/treatments/:treatmentId/attachments`
- `POST /api/treatments`
- `PUT /api/treatments/:treatmentId`
- `POST /api/treatments/:treatmentId/attachments`

### Attachments

- `POST /api/attachments`
- `GET /api/attachments/:id/download`
- `DELETE /api/attachments/:id`
- `GET /api/patients/:patientId/attachments`
- `GET /api/treatments/:treatmentId/attachments`
- `GET /uploads/...`

### Exports

- `GET /api/export/patients`
- `GET /api/export/treatments`
- `GET /api/export/patients/:patientId/full-record`
- `GET /api/export/patients/:patientId/treatments`

### Backup

- `POST /api/backup`

## Test Flow

1. Start the system.
2. Add a patient.
3. Search for a patient.
4. Edit a patient.
5. Add a treatment.
6. Edit a treatment.
7. Add a patient attachment.
8. Add a treatment attachment.
9. Preview an image attachment.
10. Download an attachment.
11. Delete an attachment.
12. Print Patient Record.
13. Download Patient PDF.
14. Print Treatment Record.
15. Download Treatment PDF.
16. Export Excel.
17. Create backup.
18. Verify the backup contains both `data/` and `uploads/`.

## Notes

- The app is localhost-only.
- SQLite database is local at `data/dental.db`.
- Uploaded files are local in `uploads/`.
- Database and uploads must be backed up together.
- Authentication is not implemented yet.
- Restore is not implemented yet.
- Do not delete `data/` or `uploads/` if real clinic records exist.
- Do not run `npm audit fix --force` unless carefully reviewed.
