# KHURANA CALILAP DENTAL RECORD SYSTEM

A local web-based dental record system for managing patient records, treatment records, appointments, attachments, print/PDF documents, Excel exports, and backups for clinic use.

This system replaces the earlier Excel/VBA workflow with a browser-based clinic record system built for local operation on a clinic computer or laptop.

## Stack

- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js + Express
- Database: SQLite using Node built-in `node:sqlite`
- Uploads: local filesystem storage
- Excel export: `exceljs`
- PDF download: `html2canvas` and `jsPDF`

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
  Backup System.bat
  README.md
```

## Current Features

### Patient Record Management

- Add, edit, and view patient records
- Auto-generated Patient ID
- Patient ID format: `P-YYYY-0001`
- Patient ID resets yearly, for example:
  `P-2026-0001`
  `P-2027-0001`
- Patient search by name, patient ID, or mobile number
- Patient classification field:
  `None`, `Senior Citizen`, `PWD`, `Senior Citizen and PWD`, `Other`
- Type of Disability appears only for PWD-related classification
- Branch location field
- Medical Alert Summary

### Treatment Record Management

- Add and view treatment records
- Auto-generated Treatment ID
- Treatment ID format: `T-YYYY-0001`
- Treatment ID resets yearly, for example:
  `T-2026-0001`
  `T-2027-0001`
- Treatment date defaults to today but remains editable
- Treatment date cannot be a future date
- Procedure choose-or-type field
- Dentist/s choose-or-type field
- Tooth number/s
- Remarks
- Treatment history per patient

### Payment and Discount Tracking

- Amount Charged
- Discount Type
- Discount Percent
- Discount Amount
- Net Amount Due
- Amount Paid
- Balance
- Senior Citizen and PWD should not double the discount
- Senior Citizen and PWD should use only one 20% discount basis unless the clinic confirms otherwise

### Appointment Scheduling

- Schedule Appointment from Patient Record
- Appointments table/list per patient
- Edit appointment
- Appointment status:
  `Scheduled`, `Completed`, `Cancelled`, `No-show`
- Only `Scheduled` appointments appear in Dashboard schedules
- `Completed`, `Cancelled`, and `No-show` remain visible in Patient Record appointment history
- Planned Procedure choose-or-type field using the same options as Treatment Procedure
- Blank Planned Procedure displays as `General Appointment`
- Appointment time is optional
- Blank appointment time displays as `No final time`

### Follow-up Appointments from Treatment

- Treatment Entry includes:
  `Next Appointment Date`
  `Next Appointment Time`
- Next Appointment Time is optional
- If Next Appointment Time is entered, Next Appointment Date is required
- Follow-up appointments from treatment appear in Dashboard schedules
- Follow-up from Treatment displays status as `Scheduled`

### Dashboard

- Clinic Overview
- Quick Totals
- Birthday Reminder card
- Recent Patients with internal scroll
- Today's Clinic Schedule
- Check Schedule by Date
- Upcoming Appointments was removed from the main Dashboard because Check Schedule by Date is used to view any selected date
- Dashboard schedule tables use internal scroll where applicable
- Patient ID is not shown in Dashboard schedule tables because clinic personnel mainly needs name, time, procedure, source, status, contact, and branch

### Birthday Reminders

- Uses the existing patient birthday field
- Shows `Birthday Today` or `Upcoming Birthday` near the top dashboard area
- Birthday is treated as a plain date, not a timezone timestamp
- The lower Birthday Reminders table was removed to avoid duplication

### Attachments

- Patient-level attachments
- Treatment-level attachments
- Attachment Category required
- Allowed files:
  `jpg`, `jpeg`, `png`, `webp`, `pdf`, `doc`, `docx`, `txt`
- Unsafe executable, archive, and script files are blocked
- Maximum attachment size: `20 MB`
- Download attachments
- Delete attachments
- Preview image attachments
- Print/PDF shows clean attachment display:
  image preview and category label only
- Print/PDF hides filename and extra attachment metadata

### Print and PDF

- Patient Record print page
- Treatment Record print page
- Patient Treatment History print/PDF
- Download PDF support
- Uses Letter-size layout
- Buttons are excluded from printable/PDF output
- Print/PDF uses a clean document-style layout

### Excel Export

- Export records to Excel
- Includes patient and treatment information
- Includes next appointment date/time where applicable

### Backup

- Backup database and uploaded files
- Backup includes:
  `data/`
  `uploads/`
  `exports/` if present
- Restoring only the database without uploads may leave attachment records without files

## Windows Setup

Open Windows PowerShell in the project folder and run:

```powershell
cd F:\dental-record-system
npm install --include=optional
npm run dev
```

Expected URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://127.0.0.1:3002`

Expected backend message:

```text
Dental server running at http://127.0.0.1:3002
```

Expected Node warning:

```text
ExperimentalWarning: SQLite is an experimental feature
```

This warning is expected and is not a crash.

## Build Command

Run this in Windows PowerShell:

```powershell
npm run build --workspace client
```

## Important Windows / WSL Warning

Do not run `npm install` in WSL/Linux for this Windows project folder.

Reason:
Running `npm install` in WSL may install Linux native optional dependencies such as `esbuild` or `rollup` packages, which can break Windows PowerShell runs.

Use Windows PowerShell for:

- `npm install`
- `npm run dev`
- `npm run build --workspace client`

If dependency issues happen, reinstall in Windows PowerShell:

```powershell
cd F:\dental-record-system
Remove-Item -Recurse -Force .\node_modules -ErrorAction SilentlyContinue
Remove-Item -Force .\package-lock.json -ErrorAction SilentlyContinue
npm cache clean --force
npm install --include=optional
npm run dev
```

## Startup and Launcher

You can start the system in either of these ways:

```powershell
cd F:\dental-record-system
npm run dev
```

or:

```powershell
Start Dental System.bat
```

### Start Dental System.bat

- Starts backend and frontend in separate command windows
- Opens `http://localhost:5173`
- Should remain inside the project folder
- Uses the batch file location, so it should not be copied out of the project folder

If a desktop shortcut is needed, create a shortcut to `Start Dental System.bat`.
Do not copy the `.bat` file itself to Desktop if it relies on project-relative paths.

### Backup System.bat

- Creates a timestamped backup folder
- Backs up `data/`, `uploads/`, and `exports/` when present

## Local File Locations

- Database file: `data/dental.db`
- Patient uploads: `uploads/patients/`
- Treatment uploads: `uploads/treatments/`
- Excel exports: `exports/`
- Full system backups: `backups/`

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
- `GET /api/patients/:patientId/appointments`
- `POST /api/patients/:patientId/appointments`

### Treatments

- `GET /api/treatments`
- `GET /api/treatments/next-id`
- `GET /api/treatments/:treatmentId`
- `GET /api/treatments/:treatmentId/attachments`
- `POST /api/treatments`
- `PUT /api/treatments/:treatmentId`
- `POST /api/treatments/:treatmentId/attachments`

### Appointments

- `GET /api/appointments/:appointmentId`
- `PATCH /api/appointments/:appointmentId`
- `PATCH /api/appointments/:appointmentId/status`

### Dashboard

- `GET /api/dashboard/summary`
- `GET /api/dashboard/schedule`
- `GET /api/dashboard/schedule-by-date?date=YYYY-MM-DD`

### Attachments

- `POST /api/attachments`
- `GET /api/attachments/:id/download`
- `DELETE /api/attachments/:id`
- `GET /uploads/...`

### Exports

- `GET /api/export/patients`
- `GET /api/export/treatments`
- `GET /api/export/patients/:patientId/full-record`
- `GET /api/export/patients/:patientId/treatments`

### Backup

- `POST /api/backup`

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

## Backup and Restore Guide

### Backup

Backup protects:

- `data/dental.db`
- `data/dental.db-shm` if present
- `data/dental.db-wal` if present
- `uploads/patients/`
- `uploads/treatments/`
- other upload subfolders under `uploads/`
- `exports/` if present

Use either:

1. The Backup page in the app
2. `Backup System.bat`

Important:

- A backup is incomplete if it includes only the database and not the uploads folder.
- For real clinic use, copy the backup folder to an external drive, another computer, or secure cloud storage.

### Manual Restore

1. Close the dental system.
2. Make a safety copy of the current `data/`, `uploads/`, and `exports/` folders.
3. Open the selected backup folder.
4. Copy backup `data/` into the project `data/` folder.
5. Copy backup `uploads/` into the project `uploads/` folder.
6. Copy `exports/` if needed.
7. Restart the system.
8. Verify patient records, treatment records, appointments, and attachments.

Important:

- Restore both database and uploads.
- Restoring only `dental.db` may leave attachment records without actual files.

## Test Flow

1. Start the system.
2. Add a patient.
3. Search for a patient.
4. Edit a patient.
5. Add a treatment.
6. Edit a treatment.
7. Schedule an appointment from Patient Record.
8. Edit an appointment.
9. Add a patient attachment.
10. Add a treatment attachment.
11. Preview an image attachment.
12. Download an attachment.
13. Delete an attachment.
14. Print Patient Record.
15. Download Patient PDF.
16. Print Treatment Record.
17. Download Treatment PDF.
18. Print or download Patient Treatment History.
19. Export Excel.
20. Create backup.
21. Verify the backup contains both `data/` and `uploads/`.

## Data Safety Notes

- Do not delete `data/dental.db` if real clinic data exists.
- Do not delete `uploads/` if real patient or treatment attachments exist.
- Do not delete `backups/` unless intentionally cleaning old backups.
- Always create a backup before updating the system.

## Current Limitations

- Local computer/laptop system only
- No cloud sync yet
- No full calendar page yet
- No SMS or email reminders yet
- No login/authentication yet
- Backups and restores are manual/local
- Appointments are managed through Patient Record and Dashboard, not a full calendar module

## Git and Local Files

The following should not be committed:

- `node_modules/`
- `data/*.db`
- `data/*.db-shm`
- `data/*.db-wal`
- `uploads/`
- `exports/`
- `backups/`
- `.env` files
- local AI/Codex folders such as `.agents` and `.codex`

## Notes

- The app is localhost-only.
- SQLite database is local at `data/dental.db`.
- Uploaded files are local in `uploads/`.
- Database and uploads must be backed up together.
- Do not run `npm audit fix --force` unless carefully reviewed.
