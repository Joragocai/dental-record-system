import React from "react";
import { Link } from "react-router-dom";

export interface PortalProfile { patientCode:string; firstName:string; lastName:string; mobileNumber:string; homeAddress:string|null }
export interface PortalTreatment { code:string; date:string; summary:string }
export interface PortalAppointment { id:string; date:string; time:string|null; status:string; branchName:string }
interface Props {
 profile:PortalProfile|null; treatments:PortalTreatment[]; appointments:PortalAppointment[];
 busy:boolean; error:string; phone:string; address:string;
 setPhone(value:string):void; setAddress(value:string):void; save():void;
}
export default function PatientPortalView({profile,treatments,appointments,busy,error,phone,address,setPhone,setAddress,save}:Props){
 return <main className="min-h-screen bg-slate-50 p-5"><div className="mx-auto max-w-4xl space-y-6">
  <header className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold">My dental records</h1><Link className="button-secondary" to="/patient-appointments">Appointment requests</Link><Link className="button-secondary" to="/patient-documents">Documents and privacy</Link><Link className="button-secondary" to="/patient-finance">Financial records</Link><Link to="/auth/account" className="button-secondary">Account</Link></header>
  {busy?<p>Loading patient-visible records…</p>:null}{error?<p role="alert" className="text-red-700">{error}</p>:null}
  {profile?<section className="rounded-xl bg-white p-5 shadow-sm space-y-3"><h2 className="text-xl font-semibold">Profile</h2>
   <p>{profile.firstName} {profile.lastName} · {profile.patientCode}</p>
   <label className="block">Mobile number<input className="text-input" value={phone} onChange={e=>setPhone(e.target.value)}/></label>
   <label className="block">Address<input className="text-input" value={address} onChange={e=>setAddress(e.target.value)}/></label>
   <button type="button" className="button-primary" onClick={save}>Save contact information</button>
  </section>:null}
  <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">Published treatment history</h2>
   {treatments.length===0?<p className="mt-3 text-slate-600">No treatment summaries have been published yet.</p>:
    <ul className="mt-3 space-y-3">{treatments.map(t=><li key={t.code} className="border-b pb-3"><strong>{t.date}</strong><p>{t.summary}</p></li>)}</ul>}
  </section>
  <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">Appointments</h2>
   {appointments.length===0?<p className="mt-3 text-slate-600">No appointments to display.</p>:
    <ul className="mt-3 space-y-3">{appointments.map(a=><li className="border-b pb-3" key={a.id}>{a.date} {a.time??"Time not finalized"} · {a.status} · {a.branchName}</li>)}</ul>}
  </section>
  <p className="text-sm text-slate-600">Finance details are available separately in My financial records, subject to finalized ledger entries. Only published clinical summaries appear here.</p>
 </div></main>;
}
