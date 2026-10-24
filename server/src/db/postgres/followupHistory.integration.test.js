import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPostgresPool } from "./pool.js";
import { migrate } from "./migrate.js";

const integration = process.env.PG_INTEGRATION_TEST === "1" ? test : test.skip;

integration("follow-up appointment history survives completion, rescheduling, and removal", async () => {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.pathname, "/dental_presentation_test");
  assert.notEqual(process.env.NODE_ENV, "production");
  const pool = await getPostgresPool();
  try {
    await migrate({pool});
    const client = await pool.connect();
    try {
      const suffix = randomUUID().replace(/\D/g, "").slice(0, 4).padEnd(4, "0");
      const patientId = "P-2026-" + suffix;
      const treatmentId = "T-2026-" + suffix;
      await client.query("BEGIN");
      try {
        await client.query(
          "INSERT INTO public.patients(patient_id,date_registered,last_name,first_name,birthday,gender,mobile_number) VALUES ($1,'2026-10-24','FOLLOWUP_FIXTURE','Test','1990-01-01','Female','09170000000')",
          [patientId]
        );
        await client.query(
          "INSERT INTO public.treatments(treatment_id,patient_id,treatment_date,procedure,dentists,next_appointment_date) VALUES ($1,$2,'2026-10-24','Fictional checkup','Test dentist','2026-10-25')",
          [treatmentId,patientId]
        );
        const first = await client.query("SELECT id,status FROM public.appointments WHERE origin_treatment_id=$1",[treatmentId]);
        assert.equal(first.rows.length,1);
        assert.equal(first.rows[0].status,"Scheduled");
        await client.query("UPDATE public.appointments SET status='Completed' WHERE id=$1",[first.rows[0].id]);
        await client.query("UPDATE public.treatments SET next_appointment_date='2026-10-26' WHERE treatment_id=$1",[treatmentId]);
        const afterReschedule = await client.query("SELECT id,status,origin_treatment_id FROM public.appointments WHERE patient_id=$1 ORDER BY id",[patientId]);
        assert.equal(afterReschedule.rows.length,2);
        assert.equal(afterReschedule.rows[0].status,"Completed");
        assert.equal(afterReschedule.rows[0].origin_treatment_id,null);
        assert.equal(afterReschedule.rows[1].status,"Scheduled");
        assert.equal(afterReschedule.rows[1].origin_treatment_id,treatmentId);
        await client.query("UPDATE public.treatments SET next_appointment_date=NULL WHERE treatment_id=$1",[treatmentId]);
        const afterRemoval = await client.query("SELECT status,origin_treatment_id FROM public.appointments WHERE patient_id=$1 ORDER BY id",[patientId]);
        assert.deepEqual(afterRemoval.rows.map(row=>row.status),["Completed","Cancelled"]);
        assert.ok(afterRemoval.rows.every(row=>row.origin_treatment_id===null));
      } finally {
        await client.query("ROLLBACK");
      }
    } finally {client.release();}
  } finally {await pool.end();}
});
