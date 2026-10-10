import {useEffect,useMemo,useState} from "react";
import {Link} from "react-router-dom";
import {useAuth} from "../context/AuthContext.js";
import {authenticatedV2Fetch} from "../auth/authApi.js";
interface Profile {patientCode:string;firstName:string;lastName:string;mobileNumber:string;homeAddress:string|null}
interface Treatment {code:string;date:string;summary:string}
interface Appointment {id:string;date:string;time:string|null;status:string;branchName:string}
export default function PatientPortalPage(){
 const auth=useAuth();
 const [profile,setProfile]=useState<Profile|null>(null);
 const [treatments,setTreatments]=useState<Treatment[]>([]);
 const [appointments,setAppointments]=useState<Appointment[]>([]);
 const [error,setError]=useState("");const [busy,setBusy]=useState(true);
 const [phone,setPhone]=useState("");const [address,setAddress]=useState("");
 const options=useMemo(()=>auth.providerSession?.accessToken&&auth.apiBaseUrl?{accessToken:auth.providerSession.accessToken,apiBaseUrl:auth.apiBaseUrl}:null,[auth.providerSession?.accessToken,auth.apiBaseUrl]);
 useEffect(()=>{
  setProfile(null);setTreatments([]);setAppointments([]);
  setPhone("");setAddress("");setError("");setBusy(true);
  if(!options){setBusy(false);return}
  let active=true;
  async function load(){
   try{
    const paths=["/me/patient-profile","/me/treatments","/me/appointments"];
    const responses=await Promise.all(paths.map(path=>authenticatedV2Fetch(path,{},options!)));
    if(responses.some(r=>!r.ok))throw new Error("The patient portal could not verify your account.");
    const [p,t,a]=await Promise.all(responses.map(r=>r.json()));
    if(active){setProfile(p);setPhone(p.mobileNumber);setAddress(p.homeAddress??"");setTreatments(t);setAppointments(a)}
   }catch{if(active)setError("Your patient records are unavailable. Contact the clinic if your account should be active.")}
   finally{if(active)setBusy(false)}
  }
  void load();return()=>{active=false};
 },[options]);
 async function save(){
  if(!options)return;
  const response=await authenticatedV2Fetch("/me/patient-profile",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({mobileNumber:phone,homeAddress:address})},options);
  if(response.ok)setProfile(await response.json());
  else setError("Unable to save contact information.");
 }
 return <main className="min-h-screen bg-slate-50 p-5"><div className="mx-auto max-w-4xl space-y-6">
  <header className="flex items-center justify-between"><h1 className="text-2xl font-bold">My dental records</h1><Link className="button-secondary" to="/patient-appointments">Appointment requests</Link><Link className="button-secondary" to="/patient-documents">Documents and privacy</Link><Link className="button-secondary" to="/patient-finance">Financial records</Link><Link to="/auth/account" className="button-secondary">Account</Link></header>
  {busy?<p>Loading patient-visible records…</p>:null}{error?<p role="alert" className="text-red-700">{error}</p>:null}
  {profile?<section className="rounded-xl bg-white p-5 shadow-sm space-y-3"><h2 className="text-xl font-semibold">Profile</h2>
   <p>{profile.firstName} {profile.lastName} · {profile.patientCode}</p>
   <label className="block">Mobile number<input className="text-input" value={phone} onChange={e=>setPhone(e.target.value)}/></label>
   <label className="block">Address<input className="text-input" value={address} onChange={e=>setAddress(e.target.value)}/></label>
   <button type="button" className="button-primary" onClick={()=>void save()}>Save contact information</button>
  </section>:null}
  <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-xl font-semibold">Published treatment history</h2>
   {treatments.length===0?<p className="mt-3 text-slate-600">No treatment summaries have been published yet.</p>:
    <ul className="mt-3 space-y-3">{treatments.map(t=><li key={t.code} className="border-b pb-3"><strong>{t.date}</strong><p>{t.summary}</p></li>)}</ul>}
  </section>
  <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-xl font-semibold">Appointments</h2>
   {appointments.length===0?<p className="mt-3 text-slate-600">No appointments to display.</p>:
   <ul className="mt-3 space-y-3">{appointments.map(a=><li className="border-b pb-3" key={a.id}>{a.date} {a.time??"Time not finalized"} · {a.status} · {a.branchName}</li>)}</ul>}
  </section>
  <p className="text-sm text-slate-600">Balances and payments will become available after the financial module is integrated. Only published clinical summaries appear here.</p>
 </div></main>
}
