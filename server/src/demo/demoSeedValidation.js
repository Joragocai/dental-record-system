import { validateAppointmentPayload, validatePatientPayload, validateTreatmentPayload } from "../utils/validation.js";

const treatmentDiscountDefaults = {
  None: 0,
  "Senior Citizen": 20,
  PWD: 20,
  "Senior Citizen/PWD": 20,
  Custom: 0
};

function assertValid(errors, label) {
  if (errors.length) {
    throw new Error(label + " failed validation: " + errors.join(" | "));
  }
}

function buildTreatmentFinancials(seed) {
  const amountCharged = Number(seed.amount_charged || 0);
  const baseDiscountPercent = Number(seed.discount_percent ?? treatmentDiscountDefaults[seed.discount_type] ?? 0);
  const discountPercent = seed.discount_type === "None" ? 0 : baseDiscountPercent;
  const discountAmount = Number((amountCharged * discountPercent / 100).toFixed(2));
  const netAmountDue = Number((amountCharged - discountAmount).toFixed(2));
  const amountPaid = Number(seed.amount_paid || 0);
  const balance = Number((netAmountDue - amountPaid).toFixed(2));
  return { amountCharged, discountPercent, discountAmount, netAmountDue, amountPaid, balance };
}

export function buildDemoTreatmentPayload(seed, { patientId, treatmentId, anchorDate, addDays }) {
  const treatmentDate = addDays(anchorDate, seed.dateOffset);
  const nextAppointmentDate = seed.next_appointment_offset == null
    ? ""
    : addDays(anchorDate, seed.next_appointment_offset);
  const financials = buildTreatmentFinancials(seed);

  return {
    treatment_id: treatmentId,
    patient_id: patientId,
    treatment_date: treatmentDate,
    tooth_numbers: seed.tooth_numbers,
    next_appointment: nextAppointmentDate,
    next_appointment_date: nextAppointmentDate,
    next_appointment_time: seed.next_appointment_time,
    procedure: seed.procedure,
    dentists: seed.dentists,
    amount_charged: financials.amountCharged,
    discount_type: seed.discount_type,
    discount_percent: financials.discountPercent,
    discount_amount: financials.discountAmount,
    net_amount_due: financials.netAmountDue,
    amount_paid: financials.amountPaid,
    balance: financials.balance,
    remarks: seed.remarks
  };
}

// Verify EVERY fictional record without writing to the database.
// Demo Fill calls this before it is allowed to delete any existing demo records.
export function validateDemoSeedFixture(demoData) {
  const { anchorDate, patients, treatments, appointments, attachments, addDays } = demoData;
  const year = anchorDate.slice(0, 4);
  const patientIds = new Map();
  const treatmentIds = new Map();
  const attachmentKeys = new Set();

  patients.forEach((seed, index) => {
    if (patientIds.has(seed.key)) throw new Error("Duplicate demo patient key: " + seed.key);
    const patientId = "P-" + year + "-" + String(index + 1).padStart(4, "0");
    const registrationDate = addDays(anchorDate, seed.date_registered_offset);
    const { errors } = validatePatientPayload({
      ...seed,
      patient_id: patientId,
      date_registered: registrationDate,
      birthday: seed.birthday
    });
    assertValid(errors, "Patient " + (index + 1));
    patientIds.set(seed.key, patientId);
  });

  treatments.forEach((seed, index) => {
    if (treatmentIds.has(seed.key)) throw new Error("Duplicate demo treatment key: " + seed.key);
    const patientId = patientIds.get(seed.patientKey);
    if (!patientId) throw new Error("Unknown demo treatment patient key: " + seed.patientKey);
    const treatmentId = "T-" + year + "-" + String(index + 1).padStart(4, "0");
    const payload = buildDemoTreatmentPayload(seed, { patientId, treatmentId, anchorDate, addDays });
    const { errors } = validateTreatmentPayload(payload);
    assertValid(errors, "Treatment " + (index + 1));
    treatmentIds.set(seed.key, treatmentId);
  });

  appointments.forEach((seed, index) => {
    const patientId = patientIds.get(seed.patientKey);
    if (!patientId) throw new Error("Unknown demo appointment patient key: " + seed.patientKey);
    const { errors } = validateAppointmentPayload({
      patient_id: patientId,
      appointment_date: addDays(anchorDate, seed.dateOffset),
      appointment_time: seed.appointment_time,
      planned_procedure: seed.planned_procedure,
      notes: seed.notes,
      status: seed.status
    });
    assertValid(errors, "Appointment " + (index + 1));
  });

  attachments.forEach((seed) => {
    if (attachmentKeys.has(seed.key)) throw new Error("Duplicate demo attachment key: " + seed.key);
    attachmentKeys.add(seed.key);
    if (!["txt", "png", "pdf"].includes(seed.fileKind)) {
      throw new Error("Unsupported demo attachment file kind: " + seed.fileKind);
    }
    if (seed.ownerType === "patient" && !patientIds.has(seed.ownerKey)
      || seed.ownerType === "treatment" && !treatmentIds.has(seed.ownerKey)
      || !["patient", "treatment"].includes(seed.ownerType)) {
      throw new Error("Unknown demo attachment owner: " + seed.ownerKey);
    }
    if (!seed.attachmentType) throw new Error("Demo attachment category is required.");
  });

  return demoData;
}
