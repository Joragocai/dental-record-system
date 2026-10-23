import test from "node:test";
import assert from "node:assert/strict";
import { buildPatientMutation, createPostgresPatient, updatePostgresPatient } from "./patientMutations.js";
import { patientFields } from "../../services/patientFields.js";

const now = "2026-10-23T09:00:00.000Z";
const seed = { patient_id: "P-2026-1001", date_registered: "2026-10-23", last_name: "Test",
  first_name: "Fictional", birthday: "1995-01-01", gender: "Female", mobile_number: "09170000000",
  condition_asthma: 1, insurance_effective_date: "" };

test("PostgreSQL patient inserts include every defined API field", () => {
  const { sql, values } = buildPatientMutation(seed, now);
  assert.equal(values.length, patientFields.length + 2);
  assert.match(sql, /INSERT INTO public.patients/);
  assert.match(sql, /RETURNING \*/);
  assert.equal(values[patientFields.indexOf("insurance_effective_date")], null);
  assert.equal(values[patientFields.indexOf("condition_asthma")], 1);
});

test("PostgreSQL patient update cannot overwrite patient ID", () => {
  const { sql, values } = buildPatientMutation(seed, now, { update: true });
  assert.match(sql, /WHERE patient_id = \$\d+/);
  assert.doesNotMatch(sql, /SET patient_id =/);
  assert.equal(values.at(-1), seed.patient_id);
});

test("PostgreSQL patient creation and update re-read record", async () => {
  const calls = [];
  const client = { query: async (sql,values) => {
    calls.push({sql,values});
    return { rows: [{ ...seed, created_at: now, updated_at: now }] };
  }};
  const created = await createPostgresPatient(client, seed, now);
  assert.equal(created.patient_id,seed.patient_id);
  const updated = await updatePostgresPatient(client,seed.patient_id,seed,now);
  assert.equal(updated.patient_id,seed.patient_id);
  assert.equal(calls.length,4);
  assert.equal(calls[0].values[0],seed.patient_id);
});
