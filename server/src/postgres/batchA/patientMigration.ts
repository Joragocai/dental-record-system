import crypto from "node:crypto";
import {
  getPatientByCode,
  listLegacyPatientMigrationStates,
  insertLegacyPatientIdentityMap,
  insertPatient,
  patientConditionFieldNames,
  type LegacyPatientIdentityMapRecord,
  type LegacyPatientMigrationState,
  type NewPatientRecord,
  type PatientConditionFieldName
} from "./patients.js";
import type { PgPoolManager, PgQueryExecutor } from "../pool.js";

type LegacyConditionValue = 0 | 1 | "0" | "1" | "Yes" | "No" | true | false | null;
type LegacyPatientConditions = { [K in PatientConditionFieldName]: LegacyConditionValue };

export type LegacyPatientRow = LegacyPatientConditions & {
  id: number;
  patient_id: string;
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
  branch_location: string | null;
  discount_eligibility: string | null;
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
  created_at: string;
  updated_at: string;
};

export interface BranchLocationMapping {
  legacyBranchLocation: string;
  branchId: string;
}

export interface MappedPatientDraft {
  patient: NewPatientRecord;
  legacyIdentityMap: LegacyPatientIdentityMapRecord;
}

export interface MigratedLegacyPatientResult extends MappedPatientDraft {
  reusedExisting: boolean;
}

export type PgMigrationTransactionRunner = PgQueryExecutor &
  Pick<PgPoolManager, "withTransaction">;

function assertIsoDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    throw new Error(`${label} must use YYYY-MM-DD format.`);
  }

  return String(value);
}

function assertIsoTimestamp(value: string, label: string): string {
  if (Number.isNaN(Date.parse(String(value)))) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }

  return String(value);
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function toLegacyBoolean(value: LegacyConditionValue, label: string): boolean {
  if (value === 1 || value === "1" || value === true || value === "Yes") {
    return true;
  }

  if (value === 0 || value === "0" || value === false || value === "No" || value === null) {
    return false;
  }

  throw new Error(`${label} must be a legacy 0/1, Yes/No, or boolean value.`);
}

export function resolveMappedBranchId(
  branchLocation: string | null,
  mappings: readonly BranchLocationMapping[]
): string {
  const normalizedLocation = String(branchLocation || "").trim();
  if (!normalizedLocation) {
    throw new Error("Legacy patient branch_location is required for Batch A mapping.");
  }

  const mapping = mappings.find((candidate) => candidate.legacyBranchLocation === normalizedLocation);
  if (!mapping) {
    throw new Error(`No V2 branch mapping exists for legacy branch_location "${normalizedLocation}".`);
  }

  if (!String(mapping.branchId || "").trim()) {
    throw new Error(`Mapped V2 branch UUID is blank for legacy branch_location "${normalizedLocation}".`);
  }

  return mapping.branchId;
}

export function mapLegacyPatientToDraft(
  legacyPatient: LegacyPatientRow,
  branchMappings: readonly BranchLocationMapping[],
  patientId: string = crypto.randomUUID()
): MappedPatientDraft {
  const branchId = resolveMappedBranchId(legacyPatient.branch_location, branchMappings);
  const createdAt = assertIsoTimestamp(legacyPatient.created_at, "Legacy patient created_at");
  const updatedAt = assertIsoTimestamp(legacyPatient.updated_at, "Legacy patient updated_at");

  const basePatient: Omit<NewPatientRecord, PatientConditionFieldName> = {
    id: patientId,
    patientCode: String(legacyPatient.patient_id),
    branchId,
    dateRegistered: assertIsoDate(legacyPatient.date_registered, "Legacy patient date_registered"),
    lastName: String(legacyPatient.last_name),
    firstName: String(legacyPatient.first_name),
    middleName: normalizeOptionalString(legacyPatient.middle_name),
    birthday: assertIsoDate(legacyPatient.birthday, "Legacy patient birthday"),
    age: legacyPatient.age === null ? null : Number(legacyPatient.age),
    gender: String(legacyPatient.gender),
    religion: normalizeOptionalString(legacyPatient.religion),
    nationality: normalizeOptionalString(legacyPatient.nationality),
    nickname: normalizeOptionalString(legacyPatient.nickname),
    patientOccupation: normalizeOptionalString(legacyPatient.patient_occupation),
    dentalInsurance: normalizeOptionalString(legacyPatient.dental_insurance),
    insuranceEffectiveDate:
      legacyPatient.insurance_effective_date === null
        ? null
        : assertIsoDate(String(legacyPatient.insurance_effective_date), "Legacy patient insurance_effective_date"),
    previousDentist: normalizeOptionalString(legacyPatient.previous_dentist),
    lastDentalVisit:
      legacyPatient.last_dental_visit === null
        ? null
        : assertIsoDate(String(legacyPatient.last_dental_visit), "Legacy patient last_dental_visit"),
    mobileNumber: String(legacyPatient.mobile_number),
    emailAddress: normalizeOptionalString(legacyPatient.email_address),
    discountEligibility: legacyPatient.discount_eligibility === null ? "None" : String(legacyPatient.discount_eligibility),
    homeAddress: normalizeOptionalString(legacyPatient.home_address),
    homeNumber: normalizeOptionalString(legacyPatient.home_number),
    officeNumber: normalizeOptionalString(legacyPatient.office_number),
    faxNumber: normalizeOptionalString(legacyPatient.fax_number),
    isMinor: normalizeOptionalString(legacyPatient.is_minor),
    parentGuardianName: normalizeOptionalString(legacyPatient.parent_guardian_name),
    parentGuardianOccupation: normalizeOptionalString(legacyPatient.parent_guardian_occupation),
    referralSource: normalizeOptionalString(legacyPatient.referral_source),
    reasonForConsultation: normalizeOptionalString(legacyPatient.reason_for_consultation),
    goodHealth: normalizeOptionalString(legacyPatient.good_health),
    underMedicalTreatment: normalizeOptionalString(legacyPatient.under_medical_treatment),
    medicalTreatmentDetails: normalizeOptionalString(legacyPatient.medical_treatment_details),
    seriousIllnessHistory: normalizeOptionalString(legacyPatient.serious_illness_history),
    seriousIllnessDetails: normalizeOptionalString(legacyPatient.serious_illness_details),
    hospitalizedHistory: normalizeOptionalString(legacyPatient.hospitalized_history),
    hospitalizationDetails: normalizeOptionalString(legacyPatient.hospitalization_details),
    takingMedications: normalizeOptionalString(legacyPatient.taking_medications),
    medicationDetails: normalizeOptionalString(legacyPatient.medication_details),
    usesTobacco: normalizeOptionalString(legacyPatient.uses_tobacco),
    usesAlcoholOrDrugs: normalizeOptionalString(legacyPatient.uses_alcohol_or_drugs),
    disabilityType: normalizeOptionalString(legacyPatient.disability_type),
    pregnant: normalizeOptionalString(legacyPatient.pregnant),
    nursing: normalizeOptionalString(legacyPatient.nursing),
    birthControlPills: normalizeOptionalString(legacyPatient.birth_control_pills),
    physicianName: normalizeOptionalString(legacyPatient.physician_name),
    physicianSpecialty: normalizeOptionalString(legacyPatient.physician_specialty),
    physicianOfficeNumber: normalizeOptionalString(legacyPatient.physician_office_number),
    physicianOfficeAddress: normalizeOptionalString(legacyPatient.physician_office_address),
    allergicToItems: normalizeOptionalString(legacyPatient.allergic_to_items),
    bloodType: normalizeOptionalString(legacyPatient.blood_type),
    bloodPressure: normalizeOptionalString(legacyPatient.blood_pressure),
    allergyLocalAnesthetic: normalizeOptionalString(legacyPatient.allergy_local_anesthetic),
    localAnestheticDetails: normalizeOptionalString(legacyPatient.local_anesthetic_details),
    allergyPenicillin: normalizeOptionalString(legacyPatient.allergy_penicillin),
    allergySulfa: normalizeOptionalString(legacyPatient.allergy_sulfa),
    allergyAspirin: normalizeOptionalString(legacyPatient.allergy_aspirin),
    allergyLatex: normalizeOptionalString(legacyPatient.allergy_latex),
    allergyOthers: normalizeOptionalString(legacyPatient.allergy_others),
    allergyOthersDetails: normalizeOptionalString(legacyPatient.allergy_others_details),
    otherMedicalCondition: normalizeOptionalString(legacyPatient.other_medical_condition),
    otherMedicalConditionDetails: normalizeOptionalString(legacyPatient.other_medical_condition_details),
    medicalAlertSummary: normalizeOptionalString(legacyPatient.medical_alert_summary),
    createdAt,
    updatedAt
  };

  const conditionValues = Object.fromEntries(
    patientConditionFieldNames.map((fieldName) => [
      fieldName,
      toLegacyBoolean(legacyPatient[fieldName], `Legacy patient ${fieldName}`)
    ])
  ) as Record<PatientConditionFieldName, boolean>;

  return {
    patient: {
      ...basePatient,
      ...conditionValues
    },
    legacyIdentityMap: {
      sourceSystem: "sqlite-v1",
      legacyPatientRowId: legacyPatient.id,
      legacyPatientCode: String(legacyPatient.patient_id),
      patientId,
      createdAt
    }
  };
}

function findPatientDifference(existing: NewPatientRecord, expected: NewPatientRecord): string | null {
  for (const [key, expectedValue] of Object.entries(expected) as [
    keyof NewPatientRecord,
    NewPatientRecord[keyof NewPatientRecord]
  ][]) {
    if (existing[key] !== expectedValue) {
      return `${String(key)} expected ${JSON.stringify(expectedValue)} but found ${JSON.stringify(existing[key])}`;
    }
  }

  return null;
}

function buildPersistedMigrationResult(existingState: LegacyPatientMigrationState): MigratedLegacyPatientResult {
  return {
    patient: existingState.patient,
    legacyIdentityMap: {
      sourceSystem: existingState.sourceSystem,
      legacyPatientRowId: existingState.legacyPatientRowId,
      legacyPatientCode: existingState.legacyPatientCode,
      patientId: existingState.patient.id,
      createdAt: existingState.mappingCreatedAt
    },
    reusedExisting: true
  };
}

function assertMatchingExistingMigration(
  existingState: LegacyPatientMigrationState,
  expectedDraft: MappedPatientDraft
): void {
  if (existingState.legacyPatientRowId !== expectedDraft.legacyIdentityMap.legacyPatientRowId) {
    throw new Error("Existing legacy patient mapping row id does not match the requested migration row id.");
  }

  if (existingState.legacyPatientCode !== expectedDraft.legacyIdentityMap.legacyPatientCode) {
    throw new Error("Existing legacy patient mapping code does not match the requested migration patient code.");
  }

  const difference = findPatientDifference(existingState.patient, expectedDraft.patient);
  if (difference) {
    throw new Error(`Existing migrated patient does not match the expected Batch A parity state: ${difference}.`);
  }
}

export async function migrateLegacyPatient(
  runner: PgMigrationTransactionRunner,
  legacyPatient: LegacyPatientRow,
  branchMappings: readonly BranchLocationMapping[]
): Promise<MigratedLegacyPatientResult> {
  return runner.withTransaction(async (executor) => {
    const existingStates = await listLegacyPatientMigrationStates(
      executor,
      "sqlite-v1",
      legacyPatient.id,
      String(legacyPatient.patient_id)
    );

    if (existingStates.length > 1) {
      throw new Error(
        "Conflicting legacy patient migration rows already exist for the same legacy identity keys."
      );
    }

    const existingState = existingStates[0];
    if (existingState) {
      const expectedDraft = mapLegacyPatientToDraft(legacyPatient, branchMappings, existingState.patient.id);
      assertMatchingExistingMigration(existingState, expectedDraft);
      return buildPersistedMigrationResult(existingState);
    }

    const patientCode = String(legacyPatient.patient_id);
    const conflictingPatient = await getPatientByCode(executor, patientCode);
    if (conflictingPatient) {
      throw new Error(
        `Patient code conflict: ${patientCode} already exists without a matching legacy identity mapping.`
      );
    }

    const mappedDraft = mapLegacyPatientToDraft(legacyPatient, branchMappings);
    const insertedPatient = await insertPatient(executor, mappedDraft.patient);
    await insertLegacyPatientIdentityMap(executor, mappedDraft.legacyIdentityMap);

    return {
      patient: insertedPatient,
      legacyIdentityMap: mappedDraft.legacyIdentityMap,
      reusedExisting: false
    };
  });
}
