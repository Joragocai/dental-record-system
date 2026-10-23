import test from "node:test";
import assert from "node:assert/strict";
import {getPostgresBalancesReport,getPostgresPatientFinancialSummary} from "./balances.js";
const rows=[
 {treatment_id:"T-2026-0001",patient_id:"P-2026-0001",first_name:"Fictional",last_name:"Patient",treatment_date:"2026-10-23",net_amount_due:"8000.00",amount_paid:"1500.00",balance:"6500.00"},
 {treatment_id:"T-2026-0002",patient_id:"P-2026-0001",first_name:"Fictional",last_name:"Patient",treatment_date:"2026-10-23",net_amount_due:"1000.00",amount_paid:"1000.00",balance:"0.00"}
];
test("PostgreSQL balances summarize each treatment correctly",async()=>{
 const client={query:async(sql)=>{assert.match(sql,/JOIN public.patients/);return{rows}}};
 const report=await getPostgresBalancesReport(client);
 assert.equal(report.summary.outstanding_total,6500);
 assert.equal(report.summary.treatments_with_balance,1);
 assert.equal(report.summary.patients_with_balance,1);
 assert.equal(report.records[0].payment_status,"Partially Paid");
 assert.equal(report.records[1].payment_status,"Settled");
 const summary=await getPostgresPatientFinancialSummary(client,"P-2026-0001");
 assert.equal(summary.total_paid,2500);
 assert.equal(summary.open_treatments,1);
});
