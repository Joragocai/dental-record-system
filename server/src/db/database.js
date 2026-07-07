import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "../../..");
const dataDir = path.join(rootDir, "data");
const dbPath = path.join(dataDir, "dental.db");

fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);

try {
  db.exec("PRAGMA journal_mode = WAL;");
} catch {
  // Some mounted filesystems reject journal mode changes; keep SQLite usable.
}

const patientColumns = `
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL UNIQUE,
  date_registered TEXT NOT NULL,
  last_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  birthday TEXT NOT NULL,
  age INTEGER,
  gender TEXT NOT NULL,
  religion TEXT,
  nationality TEXT,
  nickname TEXT,
  patient_occupation TEXT,
  dental_insurance TEXT,
  insurance_effective_date TEXT,
  previous_dentist TEXT,
  last_dental_visit TEXT,
  mobile_number TEXT NOT NULL,
  email_address TEXT,
  branch_location TEXT,
  discount_eligibility TEXT DEFAULT 'None',
  home_address TEXT,
  home_number TEXT,
  office_number TEXT,
  fax_number TEXT,
  is_minor TEXT,
  parent_guardian_name TEXT,
  parent_guardian_occupation TEXT,
  referral_source TEXT,
  reason_for_consultation TEXT,
  good_health TEXT,
  under_medical_treatment TEXT,
  medical_treatment_details TEXT,
  serious_illness_history TEXT,
  serious_illness_details TEXT,
  hospitalized_history TEXT,
  hospitalization_details TEXT,
  taking_medications TEXT,
  medication_details TEXT,
  uses_tobacco TEXT,
  uses_alcohol_or_drugs TEXT,
  disability_type TEXT,
  pregnant TEXT,
  nursing TEXT,
  birth_control_pills TEXT,
  physician_name TEXT,
  physician_specialty TEXT,
  physician_office_number TEXT,
  physician_office_address TEXT,
  allergic_to_items TEXT,
  blood_type TEXT,
  blood_pressure TEXT,
  allergy_local_anesthetic TEXT,
  local_anesthetic_details TEXT,
  allergy_penicillin TEXT,
  allergy_sulfa TEXT,
  allergy_aspirin TEXT,
  allergy_latex TEXT,
  allergy_others TEXT,
  allergy_others_details TEXT,
  condition_high_blood_pressure INTEGER DEFAULT 0,
  condition_low_blood_pressure INTEGER DEFAULT 0,
  condition_epilepsy_convulsions INTEGER DEFAULT 0,
  condition_aids_hiv INTEGER DEFAULT 0,
  condition_std INTEGER DEFAULT 0,
  condition_stomach_troubles INTEGER DEFAULT 0,
  condition_fainting_seizure INTEGER DEFAULT 0,
  condition_rapid_weight_loss INTEGER DEFAULT 0,
  condition_radiation_therapy INTEGER DEFAULT 0,
  condition_joint_replacement INTEGER DEFAULT 0,
  condition_heart_surgery INTEGER DEFAULT 0,
  condition_heart_attack INTEGER DEFAULT 0,
  condition_thyroid_problem INTEGER DEFAULT 0,
  condition_heart_disease INTEGER DEFAULT 0,
  condition_heart_murmur INTEGER DEFAULT 0,
  condition_hepatitis_liver_disease INTEGER DEFAULT 0,
  condition_rheumatic_fever INTEGER DEFAULT 0,
  condition_hay_fever_allergies INTEGER DEFAULT 0,
  condition_respiratory_problems INTEGER DEFAULT 0,
  condition_hepatitis_jaundice INTEGER DEFAULT 0,
  condition_tuberculosis INTEGER DEFAULT 0,
  condition_swollen_ankles INTEGER DEFAULT 0,
  condition_kidney_disease INTEGER DEFAULT 0,
  condition_diabetes INTEGER DEFAULT 0,
  condition_chest_pain INTEGER DEFAULT 0,
  condition_stroke INTEGER DEFAULT 0,
  condition_cancer_tumors INTEGER DEFAULT 0,
  condition_anemia INTEGER DEFAULT 0,
  condition_angina INTEGER DEFAULT 0,
  condition_asthma INTEGER DEFAULT 0,
  condition_emphysema INTEGER DEFAULT 0,
  condition_bleeding_problems INTEGER DEFAULT 0,
  condition_blood_diseases INTEGER DEFAULT 0,
  condition_head_injuries INTEGER DEFAULT 0,
  condition_arthritis_rheumatism INTEGER DEFAULT 0,
  other_medical_condition TEXT,
  other_medical_condition_details TEXT,
  medical_alert_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
`;

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (${patientColumns});

    CREATE TABLE IF NOT EXISTS treatments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      treatment_id TEXT NOT NULL UNIQUE,
      patient_id TEXT NOT NULL,
      treatment_date TEXT NOT NULL,
      tooth_numbers TEXT,
      next_appointment TEXT,
      next_appointment_date TEXT,
      next_appointment_time TEXT,
      procedure TEXT NOT NULL,
      dentists TEXT NOT NULL,
      amount_charged REAL DEFAULT 0,
      discount_type TEXT DEFAULT 'None',
      discount_percent REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      net_amount_due REAL DEFAULT 0,
      amount_paid REAL DEFAULT 0,
      balance REAL DEFAULT 0,
      remarks TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id TEXT NOT NULL,
      appointment_date TEXT NOT NULL,
      appointment_time TEXT,
      planned_procedure TEXT,
      notes TEXT,
      status TEXT DEFAULT 'Scheduled',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id TEXT NOT NULL,
      treatment_id TEXT,
      attachment_type TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      file_size INTEGER,
      uploaded_at TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
      FOREIGN KEY (treatment_id) REFERENCES treatments(treatment_id)
    );
  `);

  ensureColumn("patients", "branch_location", "TEXT");
  ensureColumn("patients", "discount_eligibility", "TEXT DEFAULT 'None'");
  ensureColumn("patients", "disability_type", "TEXT");
  ensureColumn("treatments", "next_appointment_date", "TEXT");
  ensureColumn("treatments", "next_appointment_time", "TEXT");
  ensureColumn("treatments", "discount_type", "TEXT DEFAULT 'None'");
  ensureColumn("treatments", "discount_percent", "REAL DEFAULT 0");
  ensureColumn("treatments", "discount_amount", "REAL DEFAULT 0");
  ensureColumn("treatments", "net_amount_due", "REAL DEFAULT 0");
  ensureColumn("appointments", "appointment_time", "TEXT");
  ensureColumn("appointments", "planned_procedure", "TEXT");
  ensureColumn("appointments", "notes", "TEXT");
  ensureColumn("appointments", "status", "TEXT DEFAULT 'Scheduled'");
  ensureColumn("appointments", "created_at", "TEXT");
  ensureColumn("appointments", "updated_at", "TEXT");

  db.exec(`
    UPDATE patients
    SET discount_eligibility = 'None'
    WHERE discount_eligibility IS NULL OR trim(discount_eligibility) = '';

    UPDATE treatments
    SET
      discount_type = 'None',
      discount_percent = 0,
      discount_amount = 0,
      net_amount_due = amount_charged,
      balance = round(amount_charged - amount_paid, 2)
    WHERE discount_type IS NULL OR trim(discount_type) = '';

    UPDATE treatments
    SET next_appointment_date = next_appointment
    WHERE (next_appointment_date IS NULL OR trim(next_appointment_date) = '')
      AND next_appointment IS NOT NULL
      AND trim(next_appointment) GLOB '????-??-??';

    UPDATE appointments
    SET status = 'Scheduled'
    WHERE status IS NULL OR trim(status) = '';

    UPDATE appointments
    SET created_at = COALESCE(created_at, updated_at, CURRENT_TIMESTAMP)
    WHERE created_at IS NULL OR trim(created_at) = '';

    UPDATE appointments
    SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
    WHERE updated_at IS NULL OR trim(updated_at) = '';
  `);
}

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

export default db;
export { dbPath };
