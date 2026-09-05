import type { NewPatientRecord, PatientConditionFieldName } from "../postgres/batchA/patients.js";
import { defaultClinicTimezone } from "../postgres/batchA/patientCodeAllocation.js";

type PatientGeneratedField = "id" | "patientCode" | "age" | "medicalAlertSummary" | "createdAt" | "updatedAt";
type PatientEditableRecord = Omit<NewPatientRecord, PatientGeneratedField>;
type PatientRequiredWriteKey =
  | "branchId"
  | "dateRegistered"
  | "lastName"
  | "firstName"
  | "birthday"
  | "gender"
  | "mobileNumber";

export type PatientWriteInput = Pick<PatientEditableRecord, PatientRequiredWriteKey> &
  Partial<Omit<PatientEditableRecord, PatientRequiredWriteKey>>;

export type NormalizedPatientWriteFields = Omit<NewPatientRecord, "id" | "patientCode" | "createdAt" | "updatedAt">;

export interface PatientWriteValidationResult {
  errors: string[];
  data: NormalizedPatientWriteFields;
}

const mobilePattern = /^[0-9+\-\s()]{7,20}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const conditionLabels: ReadonlyArray<readonly [PatientConditionFieldName, string]> = [
  ["condition_high_blood_pressure", "High Blood Pressure"],
  ["condition_low_blood_pressure", "Low Blood Pressure"],
  ["condition_epilepsy_convulsions", "Epilepsy / Convulsions"],
  ["condition_aids_hiv", "AIDS or HIV Infection"],
  ["condition_std", "Sexually Transmitted Disease"],
  ["condition_stomach_troubles", "Stomach Troubles / Ulcers"],
  ["condition_fainting_seizure", "Fainting Seizure"],
  ["condition_rapid_weight_loss", "Rapid Weight Loss"],
  ["condition_radiation_therapy", "Radiation Therapy"],
  ["condition_joint_replacement", "Joint Replacement / Implant"],
  ["condition_heart_surgery", "Heart Surgery"],
  ["condition_heart_attack", "Heart Attack"],
  ["condition_thyroid_problem", "Thyroid Problem"],
  ["condition_heart_disease", "Heart Disease"],
  ["condition_heart_murmur", "Heart Murmur"],
  ["condition_hepatitis_liver_disease", "Hepatitis / Liver Disease"],
  ["condition_rheumatic_fever", "Rheumatic Fever"],
  ["condition_hay_fever_allergies", "Hay Fever / Allergies"],
  ["condition_respiratory_problems", "Respiratory Problems"],
  ["condition_hepatitis_jaundice", "Hepatitis / Jaundice"],
  ["condition_tuberculosis", "Tuberculosis"],
  ["condition_swollen_ankles", "Swollen Ankles"],
  ["condition_kidney_disease", "Kidney Disease"],
  ["condition_diabetes", "Diabetes"],
  ["condition_chest_pain", "Chest Pain"],
  ["condition_stroke", "Stroke"],
  ["condition_cancer_tumors", "Cancer / Tumors"],
  ["condition_anemia", "Anemia"],
  ["condition_angina", "Angina"],
  ["condition_asthma", "Asthma"],
  ["condition_emphysema", "Emphysema"],
  ["condition_bleeding_problems", "Bleeding Problems"],
  ["condition_blood_diseases", "Blood Diseases"],
  ["condition_head_injuries", "Head Injuries"],
  ["condition_arthritis_rheumatism", "Arthritis / Rheumatism"]
];

function cleanRequiredText(value: string): string {
  return String(value ?? "").trim();
}

function cleanOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function getClinicPlainDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error(`Unable to resolve clinic date for timezone ${timeZone}.`);
  }
  return `${year}-${month}-${day}`;
}

function isValidPlainDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function calculateAge(birthday: string, today: string): number {
  const [birthYear, birthMonth, birthDay] = birthday.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = today.split("-").map(Number);
  let age = todayYear - birthYear;
  if (todayMonth < birthMonth || (todayMonth === birthMonth && todayDay < birthDay)) age -= 1;
  return Math.max(age, 0);
}

function isPwdRelatedClassification(value: string): boolean {
  return value === "PWD" || value === "Senior Citizen and PWD";
}

function shouldShowClassification(value: string): boolean {
  return value === "Senior Citizen" || value === "PWD" || value === "Senior Citizen and PWD";
}

function buildMedicalAlertSummary(patient: NormalizedPatientWriteFields): string {
  const sections: string[] = [];
  const selectedConditions = conditionLabels.filter(([field]) => patient[field]).map(([, label]) => label);
  if (selectedConditions.length) sections.push(`Medical conditions: ${selectedConditions.join(", ")}`);

  const allergyAlerts: string[] = [];
  if (patient.allergyLocalAnesthetic === "Yes") {
    allergyAlerts.push(
      patient.localAnestheticDetails ? `Local Anesthetic (${patient.localAnestheticDetails})` : "Local Anesthetic"
    );
  }
  if (patient.allergyPenicillin === "Yes") allergyAlerts.push("Penicillin / Antibiotics");
  if (patient.allergySulfa === "Yes") allergyAlerts.push("Sulfa Drugs");
  if (patient.allergyAspirin === "Yes") allergyAlerts.push("Aspirin");
  if (patient.allergyLatex === "Yes") allergyAlerts.push("Latex");
  if (patient.allergyOthers === "Yes") {
    allergyAlerts.push(patient.allergyOthersDetails ? `Other Allergies (${patient.allergyOthersDetails})` : "Other Allergies");
  }
  if (allergyAlerts.length) sections.push(`Allergies: ${allergyAlerts.join(", ")}`);

  if (patient.bloodType) sections.push(`Blood Type: ${patient.bloodType}`);
  if (shouldShowClassification(patient.discountEligibility)) {
    sections.push(`Patient classification: ${patient.discountEligibility}`);
  }
  if (isPwdRelatedClassification(patient.discountEligibility) && patient.disabilityType) {
    sections.push(`Type of disability: ${patient.disabilityType}`);
  }
  if (patient.pregnant === "Yes") sections.push("Pregnancy: Pregnant");
  if (patient.underMedicalTreatment === "Yes") {
    sections.push(`Medical Treatment: ${patient.medicalTreatmentDetails || "Under medical treatment"}`);
  }
  if (patient.seriousIllnessHistory === "Yes") {
    sections.push(`Serious Illness / Operation: ${patient.seriousIllnessDetails || "History reported"}`);
  }
  if (patient.hospitalizedHistory === "Yes") {
    sections.push(`Hospitalization: ${patient.hospitalizationDetails || "History reported"}`);
  }
  if (patient.takingMedications === "Yes") {
    sections.push(`Medications: ${patient.medicationDetails || "Medication reported"}`);
  }
  if (patient.otherMedicalCondition === "Yes" && patient.otherMedicalConditionDetails) {
    sections.push(`Other Medical Condition: ${patient.otherMedicalConditionDetails}`);
  }
  return sections.join(" | ");
}

export function validateAndNormalizePatientWriteInput(
  input: PatientWriteInput,
  now = new Date(),
  timeZone = process.env.CLINIC_TIMEZONE || defaultClinicTimezone
): PatientWriteValidationResult {
  const today = getClinicPlainDate(now, timeZone);
  const discountEligibility = cleanOptionalText(input.discountEligibility) || "None";
  const isMinor = cleanOptionalText(input.isMinor) || "No";
  const disabilityType = isPwdRelatedClassification(discountEligibility) ? cleanOptionalText(input.disabilityType) : null;

  const data: NormalizedPatientWriteFields = {
    branchId: cleanRequiredText(input.branchId),
    dateRegistered: cleanRequiredText(input.dateRegistered),
    lastName: cleanRequiredText(input.lastName),
    firstName: cleanRequiredText(input.firstName),
    middleName: cleanOptionalText(input.middleName),
    birthday: cleanRequiredText(input.birthday),
    age: 0,
    gender: cleanRequiredText(input.gender),
    religion: cleanOptionalText(input.religion),
    nationality: cleanOptionalText(input.nationality),
    nickname: cleanOptionalText(input.nickname),
    patientOccupation: cleanOptionalText(input.patientOccupation),
    dentalInsurance: cleanOptionalText(input.dentalInsurance),
    insuranceEffectiveDate: cleanOptionalText(input.insuranceEffectiveDate),
    previousDentist: cleanOptionalText(input.previousDentist),
    lastDentalVisit: cleanOptionalText(input.lastDentalVisit),
    mobileNumber: cleanRequiredText(input.mobileNumber),
    emailAddress: cleanOptionalText(input.emailAddress),
    discountEligibility,
    homeAddress: cleanOptionalText(input.homeAddress),
    homeNumber: cleanOptionalText(input.homeNumber),
    officeNumber: cleanOptionalText(input.officeNumber),
    faxNumber: cleanOptionalText(input.faxNumber),
    isMinor,
    parentGuardianName: cleanOptionalText(input.parentGuardianName),
    parentGuardianOccupation: cleanOptionalText(input.parentGuardianOccupation),
    referralSource: cleanOptionalText(input.referralSource),
    reasonForConsultation: cleanOptionalText(input.reasonForConsultation),
    goodHealth: cleanOptionalText(input.goodHealth),
    underMedicalTreatment: cleanOptionalText(input.underMedicalTreatment),
    medicalTreatmentDetails: cleanOptionalText(input.medicalTreatmentDetails),
    seriousIllnessHistory: cleanOptionalText(input.seriousIllnessHistory),
    seriousIllnessDetails: cleanOptionalText(input.seriousIllnessDetails),
    hospitalizedHistory: cleanOptionalText(input.hospitalizedHistory),
    hospitalizationDetails: cleanOptionalText(input.hospitalizationDetails),
    takingMedications: cleanOptionalText(input.takingMedications),
    medicationDetails: cleanOptionalText(input.medicationDetails),
    usesTobacco: cleanOptionalText(input.usesTobacco),
    usesAlcoholOrDrugs: cleanOptionalText(input.usesAlcoholOrDrugs),
    disabilityType,
    pregnant: cleanOptionalText(input.pregnant),
    nursing: cleanOptionalText(input.nursing),
    birthControlPills: cleanOptionalText(input.birthControlPills),
    physicianName: cleanOptionalText(input.physicianName),
    physicianSpecialty: cleanOptionalText(input.physicianSpecialty),
    physicianOfficeNumber: cleanOptionalText(input.physicianOfficeNumber),
    physicianOfficeAddress: cleanOptionalText(input.physicianOfficeAddress),
    allergicToItems: cleanOptionalText(input.allergicToItems),
    bloodType: cleanOptionalText(input.bloodType),
    bloodPressure: cleanOptionalText(input.bloodPressure),
    allergyLocalAnesthetic: cleanOptionalText(input.allergyLocalAnesthetic),
    localAnestheticDetails: cleanOptionalText(input.localAnestheticDetails),
    allergyPenicillin: cleanOptionalText(input.allergyPenicillin),
    allergySulfa: cleanOptionalText(input.allergySulfa),
    allergyAspirin: cleanOptionalText(input.allergyAspirin),
    allergyLatex: cleanOptionalText(input.allergyLatex),
    allergyOthers: cleanOptionalText(input.allergyOthers),
    allergyOthersDetails: cleanOptionalText(input.allergyOthersDetails),
    condition_high_blood_pressure: Boolean(input.condition_high_blood_pressure),
    condition_low_blood_pressure: Boolean(input.condition_low_blood_pressure),
    condition_epilepsy_convulsions: Boolean(input.condition_epilepsy_convulsions),
    condition_aids_hiv: Boolean(input.condition_aids_hiv),
    condition_std: Boolean(input.condition_std),
    condition_stomach_troubles: Boolean(input.condition_stomach_troubles),
    condition_fainting_seizure: Boolean(input.condition_fainting_seizure),
    condition_rapid_weight_loss: Boolean(input.condition_rapid_weight_loss),
    condition_radiation_therapy: Boolean(input.condition_radiation_therapy),
    condition_joint_replacement: Boolean(input.condition_joint_replacement),
    condition_heart_surgery: Boolean(input.condition_heart_surgery),
    condition_heart_attack: Boolean(input.condition_heart_attack),
    condition_thyroid_problem: Boolean(input.condition_thyroid_problem),
    condition_heart_disease: Boolean(input.condition_heart_disease),
    condition_heart_murmur: Boolean(input.condition_heart_murmur),
    condition_hepatitis_liver_disease: Boolean(input.condition_hepatitis_liver_disease),
    condition_rheumatic_fever: Boolean(input.condition_rheumatic_fever),
    condition_hay_fever_allergies: Boolean(input.condition_hay_fever_allergies),
    condition_respiratory_problems: Boolean(input.condition_respiratory_problems),
    condition_hepatitis_jaundice: Boolean(input.condition_hepatitis_jaundice),
    condition_tuberculosis: Boolean(input.condition_tuberculosis),
    condition_swollen_ankles: Boolean(input.condition_swollen_ankles),
    condition_kidney_disease: Boolean(input.condition_kidney_disease),
    condition_diabetes: Boolean(input.condition_diabetes),
    condition_chest_pain: Boolean(input.condition_chest_pain),
    condition_stroke: Boolean(input.condition_stroke),
    condition_cancer_tumors: Boolean(input.condition_cancer_tumors),
    condition_anemia: Boolean(input.condition_anemia),
    condition_angina: Boolean(input.condition_angina),
    condition_asthma: Boolean(input.condition_asthma),
    condition_emphysema: Boolean(input.condition_emphysema),
    condition_bleeding_problems: Boolean(input.condition_bleeding_problems),
    condition_blood_diseases: Boolean(input.condition_blood_diseases),
    condition_head_injuries: Boolean(input.condition_head_injuries),
    condition_arthritis_rheumatism: Boolean(input.condition_arthritis_rheumatism),
    otherMedicalCondition: cleanOptionalText(input.otherMedicalCondition),
    otherMedicalConditionDetails: cleanOptionalText(input.otherMedicalConditionDetails),
    medicalAlertSummary: null
  };

  const errors: string[] = [];
  if (!uuidPattern.test(data.branchId)) errors.push("Branch ID must be a valid UUID.");
  if (!isValidPlainDate(data.dateRegistered)) errors.push("Date Registered is required and must be valid.");
  if (isValidPlainDate(data.dateRegistered) && data.dateRegistered > today) errors.push("Date Registered cannot be in the future.");
  if (!data.lastName) errors.push("Last Name is required.");
  if (!data.firstName) errors.push("First Name is required.");
  if (!isValidPlainDate(data.birthday)) errors.push("Birthday is required and must be valid.");
  if (isValidPlainDate(data.birthday) && data.birthday > today) errors.push("Birthday cannot be in the future.");
  if (!data.gender) errors.push("Gender is required.");
  if (!data.mobileNumber) errors.push("Mobile Number is required.");
  if (data.mobileNumber && !mobilePattern.test(data.mobileNumber)) errors.push("Mobile Number format is not valid.");
  if (data.emailAddress && !emailPattern.test(data.emailAddress)) errors.push("Email Address is not valid.");
  if (data.insuranceEffectiveDate && !isValidPlainDate(data.insuranceEffectiveDate)) {
    errors.push("Insurance Effective Date must be valid.");
  }
  if (data.lastDentalVisit && !isValidPlainDate(data.lastDentalVisit)) errors.push("Last Dental Visit must be valid.");
  if (data.isMinor === "Yes" && !data.parentGuardianName) errors.push("Parent/Guardian Name is required when Is Minor is Yes.");
  if (data.underMedicalTreatment === "Yes" && !data.medicalTreatmentDetails) {
    errors.push("Medical Treatment Details are required.");
  }
  if (data.seriousIllnessHistory === "Yes" && !data.seriousIllnessDetails) {
    errors.push("Serious Illness / Operation Details are required.");
  }
  if (data.hospitalizedHistory === "Yes" && !data.hospitalizationDetails) {
    errors.push("Hospitalization Details are required.");
  }
  if (data.takingMedications === "Yes" && !data.medicationDetails) errors.push("Medication Details are required.");
  if (data.allergyLocalAnesthetic === "Yes" && !data.localAnestheticDetails) {
    errors.push("Local Anesthetic Details are required.");
  }
  if (data.allergyOthers === "Yes" && !data.allergyOthersDetails) errors.push("Allergy Others Details are required.");
  if (data.otherMedicalCondition === "Yes" && !data.otherMedicalConditionDetails) {
    errors.push("Other Medical Condition Details are required.");
  }

  if (isValidPlainDate(data.birthday)) data.age = calculateAge(data.birthday, today);
  data.medicalAlertSummary = buildMedicalAlertSummary(data);

  return { errors, data };
}
