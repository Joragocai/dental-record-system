import express from "express";
import { getPostgresPool, withPostgresTransaction } from "../db/postgres/pool.js";
import { listPostgresPatients,searchPostgresPatients,getPostgresPatient } from "../db/postgres/patients.js";
import { createPostgresPatient,updatePostgresPatient } from "../db/postgres/patientMutations.js";
import { previewPublicId,allocatePublicId } from "../db/postgres/publicIds.js";
import { listPostgresAppointments,getPostgresAppointment,createPostgresAppointment,updatePostgresAppointment,updatePostgresAppointmentStatus } from "../db/postgres/appointments.js";
import { listPostgresTreatments,getPostgresTreatment,createPostgresTreatmentOnClient,updatePostgresTreatment } from "../db/postgres/treatments.js";
import { getPostgresBalancesReport,getPostgresPatientFinancialSummary } from "../db/postgres/balances.js";
import { recordPostgresPayment,reversePostgresPayment,listPostgresPaymentRows } from "../db/postgres/ledger.js";
import { getManilaTodayIso } from "../utils/dateUtils.js";
import { getPostgresScheduleRows,getPostgresDashboardSummary } from "../db/postgres/dashboard.js";
import { getBirthdayReminders,buildTodayScheduleMetrics,isValidIsoDate } from "../services/dashboardService.js";
import { validatePatientPayload,validateTreatmentPayload,validateAppointmentPayload } from "../utils/validation.js";

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const asyncRoute=(fn)=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
function requireValid(errors){if(errors.length)throw fail(errors[0]);}
function limitedPool(pool){return pool||getPostgresPool();}

// This router is intentionally not mounted by app.js until auth, storage,
// dashboard, exports, and hosted demo controls are fully converted. It is
// exercised independently in integration tests against the isolated database.
export function createPostgresClinicalRouter(pool=null){
 const router=express.Router();
 const db=async()=>limitedPool(pool);
 router.get("/dashboard/summary",asyncRoute(async(req,res)=>{
  res.json(await getPostgresDashboardSummary(await db()));
 }));
 router.get("/dashboard/schedule",asyncRoute(async(req,res)=>{
  const client=await db();
  const today=getManilaTodayIso();
  const todayEntries=await getPostgresScheduleRows(client,today,{includeToday:true});
  const upcoming=await getPostgresScheduleRows(client,today);
  const patients=await listPostgresPatients(client);
  res.json({todaySchedule:buildTodayScheduleMetrics(todayEntries,today),
    todayAppointments:todayEntries,upcomingAppointments:upcoming,
    birthdayReminders:getBirthdayReminders(patients),today});
 }));
 router.get("/dashboard/schedule-by-date",asyncRoute(async(req,res)=>{
  const requested=String(req.query.date||"").trim();
  const date=isValidIsoDate(requested)?requested:getManilaTodayIso();
  res.json({date,appointments:await getPostgresScheduleRows(await db(),date,
    {exactDate:true,includeOtherStatuses:req.query.expanded==="true"})});
 }));
 router.get("/patients",asyncRoute(async(req,res)=>res.json(await listPostgresPatients(await db()))));
 router.get("/patients/search",asyncRoute(async(req,res)=>res.json(await searchPostgresPatients(await db(),req.query.q||""))));
 router.get("/patients/next-id",asyncRoute(async(req,res)=>{
  const year=Number(getManilaTodayIso().slice(0,4));
  res.json({patient_id:await previewPublicId(await db(),"P",year),date_registered:getManilaTodayIso()});
 }));
 router.get("/patients/:patientId",asyncRoute(async(req,res)=>{
  const row=await getPostgresPatient(await db(),req.params.patientId);
  if(!row)throw fail("Patient not found.",404);
  res.json(row);
 }));
 router.post("/patients",asyncRoute(async(req,res)=>{
  const year=Number(getManilaTodayIso().slice(0,4));
  const created=await withPostgresTransaction(async client=>{
   const id=await allocatePublicId(client,"P",year);
   const {errors,data}=validatePatientPayload({...req.body,patient_id:id});
   requireValid(errors);
   return createPostgresPatient(client,data);
  },await db());
  res.status(201).json(created);
 }));
 router.put("/patients/:patientId",asyncRoute(async(req,res)=>{
  const client=await db();
  const existing=await getPostgresPatient(client,req.params.patientId);
  if(!existing)throw fail("Patient not found.",404);
  const {errors,data}=validatePatientPayload({...req.body,patient_id:existing.patient_id});
  requireValid(errors);
  res.json(await updatePostgresPatient(client,existing.patient_id,data));
 }));
 router.get("/patients/:patientId/treatments",asyncRoute(async(req,res)=>res.json(await listPostgresTreatments(await db(),req.params.patientId))));
 router.get("/patients/:patientId/appointments",asyncRoute(async(req,res)=>res.json(await listPostgresAppointments(await db(),req.params.patientId))));
 router.post("/patients/:patientId/appointments",asyncRoute(async(req,res)=>{
  const client=await db();
  if(!await getPostgresPatient(client,req.params.patientId))throw fail("Patient not found.",404);
  const {errors,data}=validateAppointmentPayload({...req.body,patient_id:req.params.patientId});
  requireValid(errors);
  res.status(201).json(await createPostgresAppointment(client,data));
 }));
 router.get("/appointments/:appointmentId",asyncRoute(async(req,res)=>{
  const row=await getPostgresAppointment(await db(),req.params.appointmentId);
  if(!row)throw fail("Appointment not found.",404);
  res.json(row);
 }));
 router.patch("/appointments/:appointmentId",asyncRoute(async(req,res)=>{
  const client=await db();
  const existing=await getPostgresAppointment(client,req.params.appointmentId);
  if(!existing)throw fail("Appointment not found.",404);
  const {errors,data}=validateAppointmentPayload({...existing,...req.body,patient_id:existing.patient_id});
  requireValid(errors);
  res.json(await updatePostgresAppointment(client,existing.id,data));
 }));
 router.patch("/appointments/:appointmentId/status",asyncRoute(async(req,res)=>{
  const client=await db();
  const old=await getPostgresAppointment(client,req.params.appointmentId);
  if(!old)throw fail("Appointment not found.",404);
  const {errors,data}=validateAppointmentPayload({...old,status:req.body.status});
  requireValid(errors);
  res.json(await updatePostgresAppointmentStatus(client,old.id,data.status));
 }));
 router.get("/treatments",asyncRoute(async(req,res)=>res.json(await listPostgresTreatments(await db()))));
 router.get("/treatments/next-id",asyncRoute(async(req,res)=>{
  const year=Number(getManilaTodayIso().slice(0,4));
  res.json({treatment_id:await previewPublicId(await db(),"T",year)});
 }));
 router.get("/treatments/:treatmentId",asyncRoute(async(req,res)=>{
  const t=await getPostgresTreatment(await db(),req.params.treatmentId);
  if(!t)throw fail("Treatment not found.",404);
  res.json(t);
 }));
 router.post("/treatments",asyncRoute(async(req,res)=>{
  const pool=await db();
  const now=new Date().toISOString();
  const created=await withPostgresTransaction(async client=>{
   const year=Number(getManilaTodayIso().slice(0,4));
   const id=await allocatePublicId(client,"T",year);
   const {errors,data}=validateTreatmentPayload({...req.body,treatment_id:id});
   requireValid(errors);
   if(!await getPostgresPatient(client,data.patient_id))throw fail("Valid patient selection is required.");
   // Reserve ID and insert treatment plus opening ledger on one connection.
   return createPostgresTreatmentOnClient(client,data,now);
  },pool);
  res.status(201).json(created);
 }));
 router.put("/treatments/:treatmentId",asyncRoute(async(req,res)=>{
  const pool=await db();
  const existing=await getPostgresTreatment(pool,req.params.treatmentId);
  if(!existing)throw fail("Treatment not found.",404);
  // Ledger owns received money; never trust submitted paid/balance fields.
  const submitted={...req.body,treatment_id:existing.treatment_id,
   patient_id:existing.patient_id,amount_paid:existing.amount_paid};
  const charged=Number(submitted.amount_charged);
  const percentage=submitted.discount_type==="None"?0:Number(submitted.discount_percent);
  if(Number.isFinite(charged)&&Number.isFinite(percentage)){
   const discount=Number((charged*percentage/100).toFixed(2));
   const due=Number((charged-discount).toFixed(2));
   submitted.discount_amount=discount;
   submitted.net_amount_due=due;
   submitted.balance=Number((due-existing.amount_paid).toFixed(2));
  }
  const {errors,data}=validateTreatmentPayload(submitted);
  requireValid(errors);
  res.json(await updatePostgresTreatment(pool,existing.treatment_id,data));
 }));
 router.get("/balances",asyncRoute(async(req,res)=>res.json(await getPostgresBalancesReport(await db()))));
 router.get("/balances/patients/:patientId",asyncRoute(async(req,res)=>{
  const client=await db();
  if(!await getPostgresPatient(client,req.params.patientId))throw fail("Patient not found.",404);
  res.json(await getPostgresPatientFinancialSummary(client,req.params.patientId));
 }));
 router.get("/treatments/:treatmentId/payments",asyncRoute(async(req,res)=>{
  const client=await db();
  const treatment=await getPostgresTreatment(client,req.params.treatmentId);
  if(!treatment)throw fail("Treatment not found.",404);
  res.json({treatment,payments:await listPostgresPaymentRows(client,treatment.treatment_id,treatment.net_amount_due)});
 }));
 router.post("/treatments/:treatmentId/payments",asyncRoute(async(req,res)=>{
  const pool=await db();
  const result=await recordPostgresPayment(pool,req.params.treatmentId,req.body);
  res.status(result.repeated?200:201).json({...result,treatment:await getPostgresTreatment(pool,req.params.treatmentId)});
 }));
 router.post("/treatments/:treatmentId/payments/:paymentId/reverse",asyncRoute(async(req,res)=>{
  const pool=await db();
  const result=await reversePostgresPayment(pool,req.params.treatmentId,req.params.paymentId,req.body);
  res.status(result.repeated?200:201).json({...result,treatment:await getPostgresTreatment(pool,req.params.treatmentId)});
 }));
 return router;
}
