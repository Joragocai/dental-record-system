function parseIsoDate(isoDate) {
  const match = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function plainDateToUtc(plainDate) {
  return new Date(Date.UTC(plainDate.year, plainDate.month - 1, plainDate.day));
}

function utcDateToIso(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDays(isoDate, offsetDays) {
  const plainDate = parseIsoDate(isoDate);
  const utcDate = plainDateToUtc(plainDate);
  utcDate.setUTCDate(utcDate.getUTCDate() + offsetDays);
  return utcDateToIso(utcDate);
}

function birthdayFromAnchor(anchorDate, ageYears, dayOffset = 0) {
  const anchor = parseIsoDate(anchorDate);
  const shifted = plainDateToUtc({
    year: anchor.year - ageYears,
    month: anchor.month,
    day: anchor.day
  });
  shifted.setUTCDate(shifted.getUTCDate() + dayOffset);
  return utcDateToIso(shifted);
}

function patientSeed(key, overrides = {}) {
  return {
    key,
    last_name: "Demo",
    first_name: key.toUpperCase(),
    middle_name: "",
    gender: "Female",
    date_registered_offset: -7,
    birthday: null,
    religion: "Not Applicable",
    nationality: "Fictional",
    nickname: "",
    patient_occupation: "Demo Occupation",
    dental_insurance: "",
    insurance_effective_date: "",
    previous_dentist: "",
    last_dental_visit: "",
    mobile_number: "",
    email_address: "",
    branch_location: "Lilac",
    discount_eligibility: "None",
    home_address: "123 Demo Street, Sample City",
    home_number: "",
    office_number: "",
    fax_number: "",
    is_minor: "No",
    parent_guardian_name: "",
    parent_guardian_occupation: "",
    referral_source: "Walk-in demo",
    reason_for_consultation: "FICTIONAL DEMO RECORD - NOT A REAL PATIENT",
    good_health: "Yes",
    under_medical_treatment: "No",
    medical_treatment_details: "",
    serious_illness_history: "No",
    serious_illness_details: "",
    hospitalized_history: "No",
    hospitalization_details: "",
    taking_medications: "No",
    medication_details: "",
    uses_tobacco: "No",
    uses_alcohol_or_drugs: "No",
    disability_type: "",
    pregnant: "No",
    nursing: "No",
    birth_control_pills: "No",
    physician_name: "",
    physician_specialty: "",
    physician_office_number: "",
    physician_office_address: "",
    allergic_to_items: "",
    blood_type: "O+",
    blood_pressure: "120/80",
    allergy_local_anesthetic: "No",
    local_anesthetic_details: "",
    allergy_penicillin: "No",
    allergy_sulfa: "No",
    allergy_aspirin: "No",
    allergy_latex: "No",
    allergy_others: "No",
    allergy_others_details: "",
    condition_high_blood_pressure: 0,
    condition_low_blood_pressure: 0,
    condition_epilepsy_convulsions: 0,
    condition_aids_hiv: 0,
    condition_std: 0,
    condition_stomach_troubles: 0,
    condition_fainting_seizure: 0,
    condition_rapid_weight_loss: 0,
    condition_radiation_therapy: 0,
    condition_joint_replacement: 0,
    condition_heart_surgery: 0,
    condition_heart_attack: 0,
    condition_thyroid_problem: 0,
    condition_heart_disease: 0,
    condition_heart_murmur: 0,
    condition_hepatitis_liver_disease: 0,
    condition_rheumatic_fever: 0,
    condition_hay_fever_allergies: 0,
    condition_respiratory_problems: 0,
    condition_hepatitis_jaundice: 0,
    condition_tuberculosis: 0,
    condition_swollen_ankles: 0,
    condition_kidney_disease: 0,
    condition_diabetes: 0,
    condition_chest_pain: 0,
    condition_stroke: 0,
    condition_cancer_tumors: 0,
    condition_anemia: 0,
    condition_angina: 0,
    condition_asthma: 0,
    condition_emphysema: 0,
    condition_bleeding_problems: 0,
    condition_blood_diseases: 0,
    condition_head_injuries: 0,
    condition_arthritis_rheumatism: 0,
    other_medical_condition: "No",
    other_medical_condition_details: "",
    ...overrides
  };
}

function treatmentSeed(key, patientKey, dateOffset, procedure, amountCharged, amountPaid, overrides = {}) {
  return {
    key,
    patientKey,
    dateOffset,
    procedure,
    dentists: "Dr. Demo Dentist",
    tooth_numbers: "",
    amount_charged: amountCharged,
    discount_type: "None",
    discount_percent: 0,
    amount_paid: amountPaid,
    remarks: `FICTIONAL DEMO RECORD - NOT A REAL PATIENT. ${procedure}.`,
    next_appointment_offset: null,
    next_appointment_time: "",
    ...overrides
  };
}

function appointmentSeed(patientKey, dateOffset, overrides = {}) {
  return {
    patientKey,
    dateOffset,
    appointment_time: "",
    planned_procedure: "",
    notes: "FICTIONAL DEMO RECORD - NOT A REAL PATIENT",
    status: "Scheduled",
    ...overrides
  };
}

function attachmentSeed(key, ownerType, ownerKey, fileKind, attachmentType, overrides = {}) {
  return {
    key,
    ownerType,
    ownerKey,
    fileKind,
    attachmentType,
    ...overrides
  };
}

export function buildDemoSeedData(anchorDate) {
  const patients = [
    patientSeed("p1", {
      last_name: "Demoford",
      first_name: "Avery",
      gender: "Female",
      birthday: birthdayFromAnchor(anchorDate, 26, 0),
      date_registered_offset: 0,
      mobile_number: "09170000001",
      email_address: "avery.demoford@example.com",
      branch_location: "Lilac",
      referral_source: "Demo website inquiry"
    }),
    patientSeed("p2", {
      last_name: "Sampleton",
      first_name: "Bianca",
      gender: "Female",
      birthday: birthdayFromAnchor(anchorDate, 67, 3),
      date_registered_offset: -2,
      mobile_number: "09170000002",
      email_address: "bianca.sampleton@example.com",
      branch_location: "Marikina Public Market",
      discount_eligibility: "Senior Citizen",
      previous_dentist: "Dr. Fiction",
      last_dental_visit: addDays(anchorDate, -120)
    }),
    patientSeed("p3", {
      last_name: "Mockwell",
      first_name: "Caleb",
      gender: "Male",
      birthday: birthdayFromAnchor(anchorDate, 34, -12),
      date_registered_offset: -5,
      mobile_number: "09170000003",
      email_address: "caleb.mockwell@example.com",
      branch_location: "Concepcion",
      discount_eligibility: "PWD",
      disability_type: "Physical Disability",
      taking_medications: "Yes",
      medication_details: "Demo maintenance medicine only.",
      allergy_penicillin: "Yes",
      allergic_to_items: "Penicillin"
    }),
    patientSeed("p4", {
      last_name: "Placeholder",
      first_name: "Diana",
      gender: "Female",
      birthday: birthdayFromAnchor(anchorDate, 59, 5),
      date_registered_offset: -8,
      mobile_number: "09170000004",
      email_address: "diana.placeholder@example.com",
      branch_location: "Lilac",
      discount_eligibility: "Senior Citizen and PWD",
      disability_type: "Visual Disability",
      condition_diabetes: 1,
      serious_illness_history: "Yes",
      serious_illness_details: "Demo diabetes monitoring only."
    }),
    patientSeed("p5", {
      last_name: "Fictional",
      first_name: "Eli",
      gender: "Male",
      birthday: birthdayFromAnchor(anchorDate, 19, 10),
      date_registered_offset: -1,
      mobile_number: "09170000005",
      email_address: "eli.fictional@example.com",
      branch_location: "Marikina Public Market",
      discount_eligibility: "Other",
      patient_occupation: "Student"
    }),
    patientSeed("p6", {
      last_name: "Prototype",
      first_name: "Farah",
      gender: "Female",
      birthday: birthdayFromAnchor(anchorDate, 42, -20),
      date_registered_offset: -10,
      mobile_number: "09170000006",
      email_address: "farah.prototype@example.com",
      branch_location: "Lilac",
      uses_tobacco: "Yes",
      reason_for_consultation: "FICTIONAL DEMO RECORD - NOT A REAL PATIENT. Tooth sensitivity."
    }),
    patientSeed("p7", {
      last_name: "Draft",
      first_name: "Gavin",
      gender: "Male",
      birthday: birthdayFromAnchor(anchorDate, 11, -1),
      date_registered_offset: -14,
      mobile_number: "09170000007",
      email_address: "gavin.draft@example.com",
      branch_location: "Concepcion",
      is_minor: "Yes",
      parent_guardian_name: "Nina Draft",
      parent_guardian_occupation: "Demo Parent",
      reason_for_consultation: "FICTIONAL DEMO RECORD - NOT A REAL PATIENT. Pediatric cleaning."
    }),
    patientSeed("p8", {
      last_name: "Scripted",
      first_name: "Hana",
      gender: "Female",
      birthday: birthdayFromAnchor(anchorDate, 31, -30),
      date_registered_offset: -20,
      mobile_number: "09170000008",
      email_address: "hana.scripted@example.com",
      branch_location: "Lilac",
      under_medical_treatment: "Yes",
      medical_treatment_details: "Demo orthodontic review only."
    }),
    patientSeed("p9", {
      last_name: "Scenario",
      first_name: "Ian",
      gender: "Male",
      birthday: birthdayFromAnchor(anchorDate, 27, 14),
      date_registered_offset: -25,
      mobile_number: "09170000009",
      email_address: "ian.scenario@example.com",
      branch_location: "Marikina Public Market",
      condition_asthma: 1
    }),
    patientSeed("p10", {
      last_name: "Template",
      first_name: "Jules",
      gender: "Female",
      birthday: birthdayFromAnchor(anchorDate, 45, -40),
      date_registered_offset: -32,
      mobile_number: "09170000010",
      email_address: "jules.template@example.com",
      branch_location: "Concepcion",
      blood_pressure: "130/85"
    }),
    patientSeed("p11", {
      last_name: "Storyboard",
      first_name: "Kai",
      gender: "Male",
      birthday: birthdayFromAnchor(anchorDate, 52, -5),
      date_registered_offset: -40,
      mobile_number: "09170000011",
      email_address: "kai.storyboard@example.com",
      branch_location: "Lilac",
      allergy_latex: "Yes",
      allergic_to_items: "Latex"
    }),
    patientSeed("p12", {
      last_name: "Blueprint",
      first_name: "Lena",
      gender: "Female",
      birthday: birthdayFromAnchor(anchorDate, 38, 20),
      date_registered_offset: -46,
      mobile_number: "09170000012",
      email_address: "lena.blueprint@example.com",
      branch_location: "Marikina Public Market",
      uses_alcohol_or_drugs: "Yes",
      reason_for_consultation: "FICTIONAL DEMO RECORD - NOT A REAL PATIENT. Bridge follow-up."
    }),
    patientSeed("p13", {
      last_name: "Wireframe",
      first_name: "Milo",
      gender: "Male",
      birthday: birthdayFromAnchor(anchorDate, 63, -18),
      date_registered_offset: -55,
      mobile_number: "09170000013",
      email_address: "milo.wireframe@example.com",
      branch_location: "Concepcion",
      discount_eligibility: "Senior Citizen"
    }),
    patientSeed("p14", {
      last_name: "Mockup",
      first_name: "Nina",
      gender: "Female",
      birthday: birthdayFromAnchor(anchorDate, 24, 2),
      date_registered_offset: -62,
      mobile_number: "09170000014",
      email_address: "nina.mockup@example.com",
      branch_location: "Lilac",
      patient_occupation: "Graphic Designer"
    }),
    patientSeed("p15", {
      last_name: "Dryrun",
      first_name: "Owen",
      gender: "Male",
      birthday: birthdayFromAnchor(anchorDate, 29, 7),
      date_registered_offset: -75,
      mobile_number: "09170000015",
      email_address: "owen.dryrun@example.com",
      branch_location: "Concepcion",
      allergy_others: "Yes",
      allergy_others_details: "Demo mint sensitivity."
    }),
    patientSeed("p16", {
      last_name: "Checklist",
      first_name: "Pia",
      gender: "Female",
      birthday: birthdayFromAnchor(anchorDate, 14, -8),
      date_registered_offset: 0,
      mobile_number: "09170000016",
      email_address: "pia.checklist@example.com",
      branch_location: "Marikina Public Market",
      is_minor: "Yes",
      parent_guardian_name: "Ramon Checklist",
      parent_guardian_occupation: "Demo Guardian"
    })
  ];

  const treatments = [
    treatmentSeed("tr1", "p2", -90, "Dental Consultation", 600, 600, { dentists: "Dr. A. Demo" }),
    treatmentSeed("tr2", "p2", -42, "Oral Prophylaxis / Cleaning", 1500, 1200, { discount_type: "Senior Citizen", next_appointment_offset: 0, next_appointment_time: "09:00" }),
    treatmentSeed("tr3", "p2", -12, "Fluoride Treatment", 1200, 1200, { discount_type: "Senior Citizen" }),
    treatmentSeed("tr4", "p3", 0, "Dental Restoration / Pasta", 1800, 1000, { discount_type: "PWD" }),
    treatmentSeed("tr5", "p3", -14, "Follow-up Checkup", 800, 800, { next_appointment_offset: 0 }),
    treatmentSeed("tr6", "p3", -35, "X-ray", 900, 900),
    treatmentSeed("tr7", "p4", -28, "Tooth Extraction", 2500, 2000, { discount_type: "Senior Citizen/PWD", next_appointment_offset: 2, next_appointment_time: "10:30" }),
    treatmentSeed("tr8", "p4", -4, "Post Extraction Review", 700, 700),
    treatmentSeed("tr9", "p5", -2, "Dental Consultation", 600, 600),
    treatmentSeed("tr10", "p6", -48, "Tooth Filling", 1800, 1500, { next_appointment_offset: 1, next_appointment_time: "13:30" }),
    treatmentSeed("tr11", "p6", -18, "Root Canal Treatment", 6500, 3000, { amount_paid: 3000 }),
    treatmentSeed("tr12", "p6", -1, "Follow-up Checkup", 800, 800),
    treatmentSeed("tr13", "p7", 0, "Oral Prophylaxis / Cleaning", 1200, 1200, { dentists: "Dr. Pediatric Demo" }),
    treatmentSeed("tr14", "p7", -60, "Fluoride Treatment", 900, 900, { next_appointment_offset: 14 }),
    treatmentSeed("tr15", "p8", -72, "Braces Installation", 12000, 6000, { amount_paid: 6000 }),
    treatmentSeed("tr16", "p8", -24, "Orthodontic Adjustment", 1500, 1500, { next_appointment_offset: 7, next_appointment_time: "15:00" }),
    treatmentSeed("tr17", "p8", 0, "Orthodontic Adjustment", 1500, 1500),
    treatmentSeed("tr18", "p9", 0, "Emergency Treatment", 2200, 2200),
    treatmentSeed("tr19", "p9", -9, "Dental Consultation", 600, 600, { next_appointment_offset: 3 }),
    treatmentSeed("tr20", "p10", 0, "Crown Installation", 9500, 5000, { amount_paid: 5000, next_appointment_offset: 10, next_appointment_time: "11:15" }),
    treatmentSeed("tr21", "p10", -30, "Tooth Preparation", 2800, 2800),
    treatmentSeed("tr22", "p10", -5, "Follow-up Checkup", 900, 900),
    treatmentSeed("tr23", "p11", -16, "Teeth Whitening", 5000, 4500, { discount_type: "Custom", discount_percent: 10 }),
    treatmentSeed("tr24", "p12", -45, "Bridge Installation", 14000, 7000, { amount_paid: 7000 }),
    treatmentSeed("tr25", "p12", -3, "Denture Adjustment", 1600, 1600, { next_appointment_offset: 5 }),
    treatmentSeed("tr26", "p13", -84, "Dental Consultation", 600, 600),
    treatmentSeed("tr27", "p13", 0, "Tooth Extraction", 2300, 1840, { discount_type: "Senior Citizen" }),
    treatmentSeed("tr28", "p13", -20, "Follow-up Checkup", 700, 700),
    treatmentSeed("tr29", "p14", -6, "Tooth Filling", 1600, 1600, { next_appointment_offset: 21 }),
    treatmentSeed("tr30", "p15", -11, "Surgery", 8000, 4000, { amount_paid: 4000, next_appointment_offset: 30, next_appointment_time: "08:45" })
  ];

  const appointments = [
    appointmentSeed("p1", 0, { appointment_time: "08:30", planned_procedure: "Dental Consultation" }),
    appointmentSeed("p5", 0, { planned_procedure: "General Appointment" }),
    appointmentSeed("p16", 1, { appointment_time: "09:15", planned_procedure: "" }),
    appointmentSeed("p1", 2, { appointment_time: "14:00", planned_procedure: "Oral Prophylaxis / Cleaning" }),
    appointmentSeed("p6", 4, { appointment_time: "11:00", planned_procedure: "Root Canal Treatment" }),
    appointmentSeed("p8", 7, { planned_procedure: "Orthodontic Adjustment" }),
    appointmentSeed("p10", 12, { appointment_time: "10:00", planned_procedure: "Crown Installation" }),
    appointmentSeed("p15", 21, { appointment_time: "16:00", planned_procedure: "Surgery" }),
    appointmentSeed("p2", -1, { status: "Completed", appointment_time: "09:00", planned_procedure: "Follow-up Checkup" }),
    appointmentSeed("p3", -5, { status: "Cancelled", appointment_time: "13:00", planned_procedure: "Dental Restoration / Pasta" }),
    appointmentSeed("p4", -7, { status: "No-show", planned_procedure: "Follow-up Checkup" }),
    appointmentSeed("p7", -14, { status: "Completed", appointment_time: "10:00", planned_procedure: "Fluoride Treatment" }),
    appointmentSeed("p12", 6, { appointment_time: "15:45", planned_procedure: "Bridge Installation" }),
    appointmentSeed("p14", 3, { planned_procedure: "Dental Consultation" })
  ];

  const attachments = [
    attachmentSeed("att1", "patient", "p1", "txt", "Prescription"),
    attachmentSeed("att2", "patient", "p3", "png", "X-ray"),
    attachmentSeed("att3", "patient", "p4", "pdf", "Medical Clearance"),
    attachmentSeed("att4", "patient", "p8", "txt", "Consent Form"),
    attachmentSeed("att5", "patient", "p12", "png", "Treatment Plan"),
    attachmentSeed("att6", "treatment", "tr4", "png", "Pre-op Photo"),
    attachmentSeed("att7", "treatment", "tr7", "pdf", "Lab Result"),
    attachmentSeed("att8", "treatment", "tr16", "txt", "Follow-up Photo"),
    attachmentSeed("att9", "treatment", "tr20", "png", "Post-op Photo"),
    attachmentSeed("att10", "treatment", "tr30", "pdf", "Other Clinical Document")
  ];

  return {
    anchorDate,
    patients,
    treatments,
    appointments,
    attachments,
    counts: {
      patients: patients.length,
      treatments: treatments.length,
      appointments: appointments.length,
      attachments: attachments.length
    },
    addDays
  };
}
