import type { QueryResultRow } from "pg";
import type { PgQueryExecutor } from "../pool.js";

export const patientConditionFieldNames = [
  "condition_high_blood_pressure",
  "condition_low_blood_pressure",
  "condition_epilepsy_convulsions",
  "condition_aids_hiv",
  "condition_std",
  "condition_stomach_troubles",
  "condition_fainting_seizure",
  "condition_rapid_weight_loss",
  "condition_radiation_therapy",
  "condition_joint_replacement",
  "condition_heart_surgery",
  "condition_heart_attack",
  "condition_thyroid_problem",
  "condition_heart_disease",
  "condition_heart_murmur",
  "condition_hepatitis_liver_disease",
  "condition_rheumatic_fever",
  "condition_hay_fever_allergies",
  "condition_respiratory_problems",
  "condition_hepatitis_jaundice",
  "condition_tuberculosis",
  "condition_swollen_ankles",
  "condition_kidney_disease",
  "condition_diabetes",
  "condition_chest_pain",
  "condition_stroke",
  "condition_cancer_tumors",
  "condition_anemia",
  "condition_angina",
  "condition_asthma",
  "condition_emphysema",
  "condition_bleeding_problems",
  "condition_blood_diseases",
  "condition_head_injuries",
  "condition_arthritis_rheumatism"
] as const;

export type PatientConditionFieldName = (typeof patientConditionFieldNames)[number];

type PatientConditionValues = Record<PatientConditionFieldName, boolean>;

export interface NewPatientRecord extends PatientConditionValues {
  id: string;
  patientCode: string;
  branchId: string;
  dateRegistered: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  birthday: string;
  age: number | null;
  gender: string;
  religion: string | null;
  nationality: string | null;
  nickname: string | null;
  patientOccupation: string | null;
  dentalInsurance: string | null;
  insuranceEffectiveDate: string | null;
  previousDentist: string | null;
  lastDentalVisit: string | null;
  mobileNumber: string;
  emailAddress: string | null;
  discountEligibility: string;
  homeAddress: string | null;
  homeNumber: string | null;
  officeNumber: string | null;
  faxNumber: string | null;
  isMinor: string | null;
  parentGuardianName: string | null;
  parentGuardianOccupation: string | null;
  referralSource: string | null;
  reasonForConsultation: string | null;
  goodHealth: string | null;
  underMedicalTreatment: string | null;
  medicalTreatmentDetails: string | null;
  seriousIllnessHistory: string | null;
  seriousIllnessDetails: string | null;
  hospitalizedHistory: string | null;
  hospitalizationDetails: string | null;
  takingMedications: string | null;
  medicationDetails: string | null;
  usesTobacco: string | null;
  usesAlcoholOrDrugs: string | null;
  disabilityType: string | null;
  pregnant: string | null;
  nursing: string | null;
  birthControlPills: string | null;
  physicianName: string | null;
  physicianSpecialty: string | null;
  physicianOfficeNumber: string | null;
  physicianOfficeAddress: string | null;
  allergicToItems: string | null;
  bloodType: string | null;
  bloodPressure: string | null;
  allergyLocalAnesthetic: string | null;
  localAnestheticDetails: string | null;
  allergyPenicillin: string | null;
  allergySulfa: string | null;
  allergyAspirin: string | null;
  allergyLatex: string | null;
  allergyOthers: string | null;
  allergyOthersDetails: string | null;
  otherMedicalCondition: string | null;
  otherMedicalConditionDetails: string | null;
  medicalAlertSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LegacyPatientIdentityMapRecord {
  sourceSystem: string;
  legacyPatientRowId: number;
  legacyPatientCode: string;
  patientId: string;
  createdAt: string;
}

export interface LegacyPatientMigrationState {
  sourceSystem: string;
  legacyPatientRowId: number;
  legacyPatientCode: string;
  mappingCreatedAt: string;
  patient: NewPatientRecord;
}

interface PatientRow extends QueryResultRow {
  id: string;
  patient_code: string;
  branch_id: string;
  date_registered: string;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  birthday: string;
  age: number | null;
  gender: string;
  religion: string | null;
  nationality: string | null;
  nickname: string | null;
  patient_occupation: string | null;
  dental_insurance: string | null;
  insurance_effective_date: string | null;
  previous_dentist: string | null;
  last_dental_visit: string | null;
  mobile_number: string;
  email_address: string | null;
  discount_eligibility: string;
  home_address: string | null;
  home_number: string | null;
  office_number: string | null;
  fax_number: string | null;
  is_minor: string | null;
  parent_guardian_name: string | null;
  parent_guardian_occupation: string | null;
  referral_source: string | null;
  reason_for_consultation: string | null;
  good_health: string | null;
  under_medical_treatment: string | null;
  medical_treatment_details: string | null;
  serious_illness_history: string | null;
  serious_illness_details: string | null;
  hospitalized_history: string | null;
  hospitalization_details: string | null;
  taking_medications: string | null;
  medication_details: string | null;
  uses_tobacco: string | null;
  uses_alcohol_or_drugs: string | null;
  disability_type: string | null;
  pregnant: string | null;
  nursing: string | null;
  birth_control_pills: string | null;
  physician_name: string | null;
  physician_specialty: string | null;
  physician_office_number: string | null;
  physician_office_address: string | null;
  allergic_to_items: string | null;
  blood_type: string | null;
  blood_pressure: string | null;
  allergy_local_anesthetic: string | null;
  local_anesthetic_details: string | null;
  allergy_penicillin: string | null;
  allergy_sulfa: string | null;
  allergy_aspirin: string | null;
  allergy_latex: string | null;
  allergy_others: string | null;
  allergy_others_details: string | null;
  other_medical_condition: string | null;
  other_medical_condition_details: string | null;
  medical_alert_summary: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  [key: string]: unknown;
}

interface LegacyPatientMigrationRow extends PatientRow {
  source_system: string;
  legacy_patient_row_id: number | string;
  legacy_patient_code: string;
  mapping_created_at: string | Date;
}

export const patientInsertColumns = [
  "id",
  "patient_code",
  "branch_id",
  "date_registered",
  "last_name",
  "first_name",
  "middle_name",
  "birthday",
  "age",
  "gender",
  "religion",
  "nationality",
  "nickname",
  "patient_occupation",
  "dental_insurance",
  "insurance_effective_date",
  "previous_dentist",
  "last_dental_visit",
  "mobile_number",
  "email_address",
  "discount_eligibility",
  "home_address",
  "home_number",
  "office_number",
  "fax_number",
  "is_minor",
  "parent_guardian_name",
  "parent_guardian_occupation",
  "referral_source",
  "reason_for_consultation",
  "good_health",
  "under_medical_treatment",
  "medical_treatment_details",
  "serious_illness_history",
  "serious_illness_details",
  "hospitalized_history",
  "hospitalization_details",
  "taking_medications",
  "medication_details",
  "uses_tobacco",
  "uses_alcohol_or_drugs",
  "disability_type",
  "pregnant",
  "nursing",
  "birth_control_pills",
  "physician_name",
  "physician_specialty",
  "physician_office_number",
  "physician_office_address",
  "allergic_to_items",
  "blood_type",
  "blood_pressure",
  "allergy_local_anesthetic",
  "local_anesthetic_details",
  "allergy_penicillin",
  "allergy_sulfa",
  "allergy_aspirin",
  "allergy_latex",
  "allergy_others",
  "allergy_others_details",
  ...patientConditionFieldNames,
  "other_medical_condition",
  "other_medical_condition_details",
  "medical_alert_summary",
  "created_at",
  "updated_at"
] as const;

function toIsoTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapPatientRow(row: PatientRow): NewPatientRecord {
  const baseRecord: Omit<NewPatientRecord, PatientConditionFieldName> = {
    id: String(row.id),
    patientCode: String(row.patient_code),
    branchId: String(row.branch_id),
    dateRegistered: String(row.date_registered),
    lastName: String(row.last_name),
    firstName: String(row.first_name),
    middleName: row.middle_name === null ? null : String(row.middle_name),
    birthday: String(row.birthday),
    age: row.age === null ? null : Number(row.age),
    gender: String(row.gender),
    religion: row.religion === null ? null : String(row.religion),
    nationality: row.nationality === null ? null : String(row.nationality),
    nickname: row.nickname === null ? null : String(row.nickname),
    patientOccupation: row.patient_occupation === null ? null : String(row.patient_occupation),
    dentalInsurance: row.dental_insurance === null ? null : String(row.dental_insurance),
    insuranceEffectiveDate: row.insurance_effective_date === null ? null : String(row.insurance_effective_date),
    previousDentist: row.previous_dentist === null ? null : String(row.previous_dentist),
    lastDentalVisit: row.last_dental_visit === null ? null : String(row.last_dental_visit),
    mobileNumber: String(row.mobile_number),
    emailAddress: row.email_address === null ? null : String(row.email_address),
    discountEligibility: String(row.discount_eligibility),
    homeAddress: row.home_address === null ? null : String(row.home_address),
    homeNumber: row.home_number === null ? null : String(row.home_number),
    officeNumber: row.office_number === null ? null : String(row.office_number),
    faxNumber: row.fax_number === null ? null : String(row.fax_number),
    isMinor: row.is_minor === null ? null : String(row.is_minor),
    parentGuardianName: row.parent_guardian_name === null ? null : String(row.parent_guardian_name),
    parentGuardianOccupation:
      row.parent_guardian_occupation === null ? null : String(row.parent_guardian_occupation),
    referralSource: row.referral_source === null ? null : String(row.referral_source),
    reasonForConsultation: row.reason_for_consultation === null ? null : String(row.reason_for_consultation),
    goodHealth: row.good_health === null ? null : String(row.good_health),
    underMedicalTreatment: row.under_medical_treatment === null ? null : String(row.under_medical_treatment),
    medicalTreatmentDetails:
      row.medical_treatment_details === null ? null : String(row.medical_treatment_details),
    seriousIllnessHistory: row.serious_illness_history === null ? null : String(row.serious_illness_history),
    seriousIllnessDetails: row.serious_illness_details === null ? null : String(row.serious_illness_details),
    hospitalizedHistory: row.hospitalized_history === null ? null : String(row.hospitalized_history),
    hospitalizationDetails: row.hospitalization_details === null ? null : String(row.hospitalization_details),
    takingMedications: row.taking_medications === null ? null : String(row.taking_medications),
    medicationDetails: row.medication_details === null ? null : String(row.medication_details),
    usesTobacco: row.uses_tobacco === null ? null : String(row.uses_tobacco),
    usesAlcoholOrDrugs: row.uses_alcohol_or_drugs === null ? null : String(row.uses_alcohol_or_drugs),
    disabilityType: row.disability_type === null ? null : String(row.disability_type),
    pregnant: row.pregnant === null ? null : String(row.pregnant),
    nursing: row.nursing === null ? null : String(row.nursing),
    birthControlPills: row.birth_control_pills === null ? null : String(row.birth_control_pills),
    physicianName: row.physician_name === null ? null : String(row.physician_name),
    physicianSpecialty: row.physician_specialty === null ? null : String(row.physician_specialty),
    physicianOfficeNumber: row.physician_office_number === null ? null : String(row.physician_office_number),
    physicianOfficeAddress: row.physician_office_address === null ? null : String(row.physician_office_address),
    allergicToItems: row.allergic_to_items === null ? null : String(row.allergic_to_items),
    bloodType: row.blood_type === null ? null : String(row.blood_type),
    bloodPressure: row.blood_pressure === null ? null : String(row.blood_pressure),
    allergyLocalAnesthetic:
      row.allergy_local_anesthetic === null ? null : String(row.allergy_local_anesthetic),
    localAnestheticDetails:
      row.local_anesthetic_details === null ? null : String(row.local_anesthetic_details),
    allergyPenicillin: row.allergy_penicillin === null ? null : String(row.allergy_penicillin),
    allergySulfa: row.allergy_sulfa === null ? null : String(row.allergy_sulfa),
    allergyAspirin: row.allergy_aspirin === null ? null : String(row.allergy_aspirin),
    allergyLatex: row.allergy_latex === null ? null : String(row.allergy_latex),
    allergyOthers: row.allergy_others === null ? null : String(row.allergy_others),
    allergyOthersDetails: row.allergy_others_details === null ? null : String(row.allergy_others_details),
    otherMedicalCondition: row.other_medical_condition === null ? null : String(row.other_medical_condition),
    otherMedicalConditionDetails:
      row.other_medical_condition_details === null ? null : String(row.other_medical_condition_details),
    medicalAlertSummary: row.medical_alert_summary === null ? null : String(row.medical_alert_summary),
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at)
  };

  const conditionValues = Object.fromEntries(
    patientConditionFieldNames.map((fieldName) => [fieldName, Boolean(row[fieldName])])
  ) as PatientConditionValues;

  return {
    ...baseRecord,
    ...conditionValues
  };
}

function mapLegacyPatientMigrationRow(row: LegacyPatientMigrationRow): LegacyPatientMigrationState {
  return {
    sourceSystem: String(row.source_system),
    legacyPatientRowId: Number(row.legacy_patient_row_id),
    legacyPatientCode: String(row.legacy_patient_code),
    mappingCreatedAt: toIsoTimestamp(row.mapping_created_at),
    patient: mapPatientRow(row)
  };
}

function buildPatientInsertValues(patient: NewPatientRecord): readonly unknown[] {
  return [
    patient.id,
    patient.patientCode,
    patient.branchId,
    patient.dateRegistered,
    patient.lastName,
    patient.firstName,
    patient.middleName,
    patient.birthday,
    patient.age,
    patient.gender,
    patient.religion,
    patient.nationality,
    patient.nickname,
    patient.patientOccupation,
    patient.dentalInsurance,
    patient.insuranceEffectiveDate,
    patient.previousDentist,
    patient.lastDentalVisit,
    patient.mobileNumber,
    patient.emailAddress,
    patient.discountEligibility,
    patient.homeAddress,
    patient.homeNumber,
    patient.officeNumber,
    patient.faxNumber,
    patient.isMinor,
    patient.parentGuardianName,
    patient.parentGuardianOccupation,
    patient.referralSource,
    patient.reasonForConsultation,
    patient.goodHealth,
    patient.underMedicalTreatment,
    patient.medicalTreatmentDetails,
    patient.seriousIllnessHistory,
    patient.seriousIllnessDetails,
    patient.hospitalizedHistory,
    patient.hospitalizationDetails,
    patient.takingMedications,
    patient.medicationDetails,
    patient.usesTobacco,
    patient.usesAlcoholOrDrugs,
    patient.disabilityType,
    patient.pregnant,
    patient.nursing,
    patient.birthControlPills,
    patient.physicianName,
    patient.physicianSpecialty,
    patient.physicianOfficeNumber,
    patient.physicianOfficeAddress,
    patient.allergicToItems,
    patient.bloodType,
    patient.bloodPressure,
    patient.allergyLocalAnesthetic,
    patient.localAnestheticDetails,
    patient.allergyPenicillin,
    patient.allergySulfa,
    patient.allergyAspirin,
    patient.allergyLatex,
    patient.allergyOthers,
    patient.allergyOthersDetails,
    ...patientConditionFieldNames.map((fieldName) => patient[fieldName]),
    patient.otherMedicalCondition,
    patient.otherMedicalConditionDetails,
    patient.medicalAlertSummary,
    patient.createdAt,
    patient.updatedAt
  ];
}

export async function insertPatient(executor: PgQueryExecutor, patient: NewPatientRecord): Promise<NewPatientRecord> {
  const placeholders = patientInsertColumns.map((_, index) => `$${index + 1}`).join(", ");
  const result = await executor.query<PatientRow>(
    `INSERT INTO patients (${patientInsertColumns.join(", ")})
     VALUES (${placeholders})
     RETURNING *`,
    buildPatientInsertValues(patient)
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Patient insert did not return a row.");
  }

  return mapPatientRow(row);
}

export async function getPatientByCode(
  executor: PgQueryExecutor,
  patientCode: string
): Promise<NewPatientRecord | null> {
  const result = await executor.query<PatientRow>("SELECT * FROM patients WHERE patient_code = $1", [patientCode]);
  return result.rows[0] ? mapPatientRow(result.rows[0]) : null;
}

export async function getPatientById(executor: PgQueryExecutor, patientId: string): Promise<NewPatientRecord | null> {
  const result = await executor.query<PatientRow>("SELECT * FROM patients WHERE id = $1", [patientId]);
  return result.rows[0] ? mapPatientRow(result.rows[0]) : null;
}

export async function insertLegacyPatientIdentityMap(
  executor: PgQueryExecutor,
  record: LegacyPatientIdentityMapRecord
): Promise<LegacyPatientIdentityMapRecord> {
  await executor.query(
    `INSERT INTO legacy_patient_identity_map
       (source_system, legacy_patient_row_id, legacy_patient_code, patient_id, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [record.sourceSystem, record.legacyPatientRowId, record.legacyPatientCode, record.patientId, record.createdAt]
  );

  return record;
}

export async function listLegacyPatientMigrationStates(
  executor: PgQueryExecutor,
  sourceSystem: string,
  legacyPatientRowId: number,
  legacyPatientCode: string
): Promise<LegacyPatientMigrationState[]> {
  const result = await executor.query<LegacyPatientMigrationRow>(
    `SELECT
       m.source_system,
       m.legacy_patient_row_id,
       m.legacy_patient_code,
       m.created_at AS mapping_created_at,
       p.*
     FROM legacy_patient_identity_map m
     JOIN patients p ON p.id = m.patient_id
     WHERE m.source_system = $1
       AND (m.legacy_patient_row_id = $2 OR m.legacy_patient_code = $3)
     ORDER BY m.legacy_patient_row_id ASC, m.legacy_patient_code ASC`,
    [sourceSystem, legacyPatientRowId, legacyPatientCode]
  );

  return result.rows.map(mapLegacyPatientMigrationRow);
}

export async function listLegacyPatientMigrationStatesByCode(
  executor: PgQueryExecutor,
  sourceSystem: string,
  legacyPatientCode: string
): Promise<LegacyPatientMigrationState[]> {
  const result = await executor.query<LegacyPatientMigrationRow>(
    `SELECT
       m.source_system,
       m.legacy_patient_row_id,
       m.legacy_patient_code,
       m.created_at AS mapping_created_at,
       p.*
     FROM legacy_patient_identity_map m
     JOIN patients p ON p.id = m.patient_id
     WHERE m.source_system = $1
       AND m.legacy_patient_code = $2
     ORDER BY m.legacy_patient_row_id ASC, m.legacy_patient_code ASC`,
    [sourceSystem, legacyPatientCode]
  );

  return result.rows.map(mapLegacyPatientMigrationRow);
}
