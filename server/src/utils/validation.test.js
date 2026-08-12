import assert from "node:assert/strict";
import test from "node:test";
import { validateTreatmentPayload } from "./validation.js";

const FIXED_NOW = new Date("2026-08-09T12:00:00.000Z");

function buildValidTreatmentPayload(overrides = {}) {
  return {
    treatment_id: "T-2026-0001",
    patient_id: "P-2026-0001",
    treatment_date: "2026-08-09",
    next_appointment_date: "",
    next_appointment_time: "",
    procedure: "Cleaning",
    dentists: "Dr. Demo",
    amount_charged: "1000.00",
    discount_type: "None",
    discount_percent: "0",
    discount_amount: "0.00",
    net_amount_due: "1000.00",
    amount_paid: "250.00",
    balance: "750.00",
    remarks: "",
    ...overrides
  };
}

function withFrozenToday(t, callback) {
  t.mock.timers.enable({ apis: ["Date"], now: FIXED_NOW });
  t.after(() => t.mock.timers.reset());
  callback();
}

test("validateTreatmentPayload rejects treatment dates after Sunday, August 9, 2026", (t) => {
  withFrozenToday(t, () => {
    const result = validateTreatmentPayload(
      buildValidTreatmentPayload({
        treatment_date: "2026-08-10"
      })
    );

    assert.ok(result.errors.includes("Treatment Date cannot be in the future."));
  });
});

test("validateTreatmentPayload accepts current and past treatment dates according to current rules", (t) => {
  withFrozenToday(t, () => {
    const currentDateResult = validateTreatmentPayload(
      buildValidTreatmentPayload({
        treatment_date: "2026-08-09"
      })
    );
    const pastDateResult = validateTreatmentPayload(
      buildValidTreatmentPayload({
        treatment_id: "T-2026-0002",
        treatment_date: "2026-08-08"
      })
    );

    assert.equal(currentDateResult.errors.includes("Treatment Date cannot be in the future."), false);
    assert.equal(pastDateResult.errors.includes("Treatment Date cannot be in the future."), false);
  });
});

test("validateTreatmentPayload preserves Senior Citizen discount and balance calculations", () => {
  const result = validateTreatmentPayload(
    buildValidTreatmentPayload({
      discount_type: "Senior Citizen",
      discount_percent: "",
      discount_amount: "200.00",
      net_amount_due: "800.00",
      amount_paid: "300.00",
      balance: "500.00"
    })
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.data.discount_type, "Senior Citizen");
  assert.equal(result.data.discount_percent, 20);
  assert.equal(result.data.discount_amount, 200);
  assert.equal(result.data.net_amount_due, 800);
  assert.equal(result.data.amount_paid, 300);
  assert.equal(result.data.balance, 500);
});

test("validateTreatmentPayload preserves PWD discount and balance calculations", () => {
  const result = validateTreatmentPayload(
    buildValidTreatmentPayload({
      discount_type: "PWD",
      discount_percent: "",
      discount_amount: "200.00",
      net_amount_due: "800.00",
      amount_paid: "125.50",
      balance: "674.50"
    })
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.data.discount_type, "PWD");
  assert.equal(result.data.discount_percent, 20);
  assert.equal(result.data.discount_amount, 200);
  assert.equal(result.data.net_amount_due, 800);
  assert.equal(result.data.amount_paid, 125.5);
  assert.equal(result.data.balance, 674.5);
});

test("validateTreatmentPayload keeps Senior Citizen/PWD on a single 20 percent discount basis", () => {
  const result = validateTreatmentPayload(
    buildValidTreatmentPayload({
      discount_type: "Senior Citizen/PWD",
      discount_percent: "",
      discount_amount: "200.00",
      net_amount_due: "800.00",
      amount_paid: "0.00",
      balance: "800.00"
    })
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.data.discount_type, "Senior Citizen/PWD");
  assert.equal(result.data.discount_percent, 20);
  assert.equal(result.data.discount_amount, 200);
  assert.equal(result.data.net_amount_due, 800);
  assert.equal(result.data.amount_paid, 0);
  assert.equal(result.data.balance, 800);
});

test("validateTreatmentPayload rejects mismatched derived balance values", () => {
  const result = validateTreatmentPayload(
    buildValidTreatmentPayload({
      discount_type: "Senior Citizen",
      discount_percent: "",
      discount_amount: "200.00",
      net_amount_due: "800.00",
      amount_paid: "300.00",
      balance: "400.00"
    })
  );

  assert.ok(result.errors.includes("Balance must equal Net Amount Due minus Amount Paid."));
});

test("validateTreatmentPayload requires a next appointment date when next appointment time is set", () => {
  const result = validateTreatmentPayload(
    buildValidTreatmentPayload({
      next_appointment_date: "",
      next_appointment_time: "09:30"
    })
  );

  assert.ok(result.errors.includes("Next Appointment Date is required when Next Appointment Time is set."));
});

test("validateTreatmentPayload rejects follow-up dates earlier than the treatment date", () => {
  const result = validateTreatmentPayload(
    buildValidTreatmentPayload({
      next_appointment_date: "2026-08-08",
      next_appointment_time: "09:30"
    })
  );

  assert.ok(result.errors.includes("Next Appointment Date cannot be earlier than Treatment Date."));
});
