# Phase 04 — Hosted UI & Interview Readiness

**Project:** Dental Presentation — single-clinic fictional demo  
**Checked branch:** `feature/single-clinic-cloud`  
**Last verified deployed commit before these fixes:** `3ede56b`  
**Demo website:** https://khurana-dental-system.vercel.app  
**Date:** 2026-10-24 (Asia/Manila)

## State and safety

- Hosted **Demo Fill** and **Demo Reset** were manually tested and reported working by the project owner. This is user-reported confirmation, not a fresh authenticated browser run.
- The Phase 04 UI fixes in the local checkout have **not** been committed, pushed, or deployed.
- Use only fictional dental records. Do not put real patient identifiers, health histories, or actual payment data into an interview demo.
- Never run Reset merely as a navigation check. Fill replaces active data; Reset deletes active data. Downloaded encrypted backups are independent, but hosted restore is not yet implemented.
- The available automated tests run locally or on an isolated local PostgreSQL database. They do **not** validate the signed-in hosted UI.
- Do not expose passwords, Supabase secret keys, service-role keys, database connection strings, or downloaded backup passphrases.

## Phase 04 code fixes prepared locally

1. **Patient Search:** ignore obsolete responses when a new search begins; show loading/error/retry states instead of a misleading empty result.
2. **Attachment preview:** portal-based full-screen lightbox, keyboard Escape, focus trapping/restoration, screen scroll lock, and an accessible close button. Mobile height follows the actual viewport.
3. **Patient and treatment record pages:** show an actionable error and Retry rather than an endless loading indicator when a record fails to load.
4. **Patient, treatment, and treatment-history print views:** coordinate required record data before displaying the printout; show error/retry instead of a blank or incomplete print page.
5. **PDF export performance:** lazy-load html2canvas and jsPDF only when the user clicks Download PDF, reducing the main JavaScript bundle. Do not claim PDF layout correctness without visual testing.

## Hosted manual acceptance checks — all still pending independent verification

Run these while signed in to the hosted website after the Phase 04 changes are deployed.

| Priority | Workflow | Expected observation |
| --- | --- | --- |
| P0 | Sign in; refresh the Home page | Authorized session works; no public record access |
| P0 | Demo Fill, Home, Patient Search | Dashboard data and searchable fictional patients are consistent |
| P0 | Search quickly: partial name, then patient ID | Only the latest query controls displayed results |
| P0 | Open a fictional patient; edit; refresh | Patient data persists; back button and success notice work |
| P0 | Record a fictional treatment and inspect the patient history | Correct patient linkage and treatment/amount fields |
| P0 | Appointment creation, editing, status change | Dates, status, and Home schedule agree |
| P0 | Balances: unpaid/partially paid/settled; record fictional payment | Balances change once, transaction appears, no negative amounts |
| P0 | Patient and treatment private image attachments | Preview fills the screen, Close/Escape works, Download works, protected file stays private |
| P0 | Patient, treatment, and history Print/PDF | Preview is complete; PDF and print show correct patient and treatment, including images if provided |
| P1 | Protected Excel exports | Export works only when authorized and contains correct fictional data |
| P1 | Account menu and Backup & Recovery navigation | Desktop and mobile menu navigation works, without triggering backup/reset |
| P1 | Error and retry state | Temporary network failure shows an actionable error instead of endless Loading |
| P1 | Sign out | Session ends; protected content cannot be reached without logging in |

## Viewport acceptance matrix

Use your browser's responsive-design mode or a device:

- **320 px:** very narrow mobile; no clipped buttons, page-wide horizontal scrolling, or inaccessible payment/preview dialog.
- **375 / 390 / 430 px:** typical mobile; record cards, filters, image preview, payment form, and sticky controls remain usable.
- **768 / 1024 px:** tablet; mobile navigation and account controls remain accessible; wide tables scroll within their container.
- **1366 px:** laptop below 1440 px navigation breakpoint; menu can open, scroll, and close.
- **1440 / 1920 px:** desktop; full navigation, table headers, and account dropdown appear correctly.

For every viewport, verify horizontal scrolling is confined to data tables, modal action buttons remain reachable when the keyboard opens, and a preview can always be dismissed.

## Interview walkthrough (show the working system; no slides)

Target **8–10 minutes**, using only fictional records:

1. **Login and purpose (30 sec):** this is a single-clinic demonstration of secured dental record management using React/Vite, Node/Express, PostgreSQL, and Supabase services on Vercel/Render.
2. **Home (45 sec):** explain the activity and schedule overview plus the quick actions.
3. **Patient Search and Patient Record (1 min):** open a seeded patient; show medical alert summary, history, related appointments, and financial overview.
4. **Register Patient (1 min):** register one additional fictional patient and return to its record; point out validation and generated patient ID.
5. **Record Treatment (1.5 min):** select the patient, save a treatment, review the treatment record, and return to history.
6. **Appointments (45 sec):** demonstrate planned follow-up and an appointment status, explaining changes in schedule.
7. **Balances and Payments (1 min):** show filter by payment status, open a treatment, record a fictional partial payment, and show updated balance and append-only transaction history.
8. **Attachments (45 sec):** preview and securely download one fictional image; explain private Supabase Storage and authenticated access.
9. **Print/Export (45 sec):** show printable patient/treatment records and one Excel export; verify no actual private data.
10. **Demo Fill/Reset and wrap-up (45 sec):** explain that the hosted demo can be repopulated and reset for demonstrations. Do not click Reset unless intentionally ending the demo and all manual changes are disposable.

Suggested closing statement: *“This demonstrates the complete workflow from patient registration to treatment history, appointments, financial transactions, and controlled document access. The hosted demo uses fictional data and protected cloud services.”*

## Known limits to disclose accurately

- The hosted project is an **interview demo**, not a production-ready dental clinic system and not the separate multi-tenant V2 project.
- The encrypted backup download feature is available, but a **hosted restore UI is not implemented**. Local recovery verification is not equivalent to a production restore drill.
- The code uses private, authenticated attachment APIs. Live preview and PDF output must still be checked visually in the deployed browser.
- No independent authenticated hosted E2E run or browser screenshot-based QA was completed by DevSpace in this phase.
- The frontend build still reports a remaining JavaScript chunk-size warning. Lazy PDF imports reduced the initial JavaScript bundle materially.

## Before deployment

1. Review the local Phase 04 changes and inspect `git diff`.
2. Run frontend build, regression tests, and selected isolated integration tests.
3. Obtain approval to commit and push the branch.
4. Deploy Vercel frontend for the UI changes. Render backend does not require a code deploy for a frontend-only change.
5. Complete the hosted manual acceptance checks and viewport matrix above.
