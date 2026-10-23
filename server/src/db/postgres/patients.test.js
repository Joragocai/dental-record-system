import test from "node:test";
import assert from "node:assert/strict";
import { getPostgresPatient, listPostgresPatients, searchPostgresPatients } from "./patients.js";

function fakeClient(rows) {
  const queries=[];
  return { queries, query: async (sql,values=[]) => { queries.push({sql,values}); return {rows}; } };
}

test("PostgreSQL patients are listed and decorated for the existing UI", async () => {
  const client=fakeClient([{patient_id:"P-2026-0001",last_name:"Patient",first_name:"Fictional",middle_name:"",
    date_registered:"2026-10-23",birthday:"1990-01-01"}]);
  const patients=await listPostgresPatients(client);
  assert.equal(patients.length,1);
  assert.equal(patients[0].date_registered,"2026-10-23");
  assert.match(patients[0].display_name,/Patient/);
});

test("Patient ID lookups use parameters instead of interpolating IDs", async () => {
  const client=fakeClient([]);
  assert.equal(await getPostgresPatient(client,"P-2026-0001' OR TRUE --"),null);
  assert.equal(client.queries[0].values[0],"P-2026-0001' OR TRUE --");
  assert.match(client.queries[0].sql,/patient_id = \$1/);
});

test("Search uses parameterized ILIKE and escapes wildcard input", async () => {
  const client=fakeClient([]);
  await searchPostgresPatients(client," %_ ");
  assert.deepEqual(client.queries[0].values,["%\\%\\_%"]);
  assert.match(client.queries[0].sql,/ILIKE \$1/);
});
