import {useEffect,useRef,useState,type FormEvent} from "react";
import {Link} from "react-router-dom";
import {useAuth} from "../context/AuthContext.js";
import {authenticatedV2Fetch} from "../auth/authApi.js";
export default function PatientAppointmentRequestsPage(){
 const auth=useAuth();
 const [branch,setBranch]=useState(""),[date,setDate]=useState(""),[time,setTime]=useState("");
 const [procedure,setProcedure]=useState(""),[appointment,setAppointment]=useState("");
 const [newDate,setNewDate]=useState(""),[newTime,setNewTime]=useState("");
 const [reason,setReason]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const pending=useRef<{fingerprint:string;key:string}|null>(null);
 const [branches,setBranches]=useState<{id:string;name:string}[]>([]);
 const [appointments,setAppointments]=useState<{id:string;date:string;status:string}[]>([]);
 const [history,setHistory]=useState<{id:string;request_type:string;status:string;requested_date:string|null}[]>([]);
 useEffect(()=>{
  const token=auth.providerSession?.accessToken,base=auth.apiBaseUrl;
  if(!token||!base){setBranches([]);setAppointments([]);return;}
  let active=true;const opts={accessToken:token,apiBaseUrl:base};
  void Promise.all([
   authenticatedV2Fetch("/me/appointment-branches",{},opts),
   authenticatedV2Fetch("/me/appointments",{},opts),
   authenticatedV2Fetch("/me/appointment-requests",{},opts)
  ]).then(async([b,a,h])=>{
   if(!b.ok||!a.ok||!h.ok)throw Error();
   const [bs,items,requests]=await Promise.all([b.json(),a.json(),h.json()]);
   if(active){setBranches(bs);setAppointments(items);setHistory(requests)}
  }).catch(()=>{if(active)setMessage("Appointment options are unavailable.");});
  return()=>{active=false};
 },[auth.providerSession?.accessToken,auth.apiBaseUrl]);
 async function submit(event:FormEvent,kind:"new"|"cancel"|"reschedule"){
  event.preventDefault();setMessage("");
  if(!auth.providerSession||!auth.apiBaseUrl){setMessage("Sign in with your patient account first.");return;}
  const options={accessToken:auth.providerSession.accessToken,apiBaseUrl:auth.apiBaseUrl};
  const url=kind==="new"?"/me/appointment-requests":"/me/appointments/"+encodeURIComponent(appointment)+"/"+(kind==="cancel"?"cancel-request":"reschedule-request");
  const data=kind==="new"?{branchId:branch,appointmentDate:date,appointmentTime:time||null,plannedProcedure:procedure}:
    kind==="cancel"?{reason}:
    {branchId:branch,appointmentDate:newDate,appointmentTime:newTime||null,reason};
  const fingerprint=JSON.stringify([kind,appointment,data]);
  const key=pending.current?.fingerprint===fingerprint?pending.current.key:crypto.randomUUID();
  pending.current={fingerprint,key};
  const payload={...data,idempotencyKey:key};
  setBusy(true);
  try{
   const response=await authenticatedV2Fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)},options);
   if(!response.ok)throw Error();
   pending.current=null;
   const refresh=await authenticatedV2Fetch("/me/appointment-requests",{},options);
   if(refresh.ok)setHistory(await refresh.json());
   setMessage(kind==="new"?"Appointment request submitted for clinic confirmation.":"Your change request was sent for clinic review. The existing appointment remains unchanged.");
  }catch{setMessage("The request was not confirmed. Contact the clinic before retrying.");}
  finally{setBusy(false)}
 }
 return <main className="min-h-screen bg-slate-50 p-5"><div className="mx-auto max-w-3xl space-y-6">
  <header><Link to="/patient-portal" className="text-clinic-700">← My dental records</Link><h1 className="mt-3 text-2xl font-bold">Appointment requests</h1>
   <p>Requests need confirmation from clinic staff. A requested date or time is not a reservation.</p></header>
  {message?<p role="status" className="rounded-lg bg-white p-3">{message}</p>:null}
  <form className="space-y-3 rounded-xl bg-white p-5" onSubmit={e=>void submit(e,"new")}>
   <h2 className="text-xl font-semibold">Request a new appointment</h2>
   <label className="block">Clinic branch<select required className="text-input" value={branch} onChange={e=>setBranch(e.target.value)}><option value="">Select a clinic</option>{branches.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select></label>
   <label className="block">Preferred date<input type="date" required className="text-input" value={date} onChange={e=>setDate(e.target.value)}/></label>
   <label className="block">Preferred time (optional)<input type="time" className="text-input" value={time} onChange={e=>setTime(e.target.value)}/></label>
   <label className="block">Reason for visit<input className="text-input" maxLength={200} value={procedure} onChange={e=>setProcedure(e.target.value)}/></label>
   <button disabled={busy} className="button-primary" type="submit">Request appointment</button>
  </form>
  <form className="space-y-3 rounded-xl bg-white p-5" onSubmit={e=>void submit(e,"cancel")}>
   <h2 className="text-xl font-semibold">Request cancellation</h2>
   <label className="block">Existing appointment<select required className="text-input" value={appointment} onChange={e=>setAppointment(e.target.value)}><option value="">Select an appointment</option>{appointments.filter(a=>["requested","pending_confirmation","confirmed"].includes(a.status)).map(a=><option key={a.id} value={a.id}>{a.date} · {a.status}</option>)}</select></label>
   <label className="block">Reason (optional)<input className="text-input" maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   <button disabled={busy} className="button-primary" type="submit">Send cancellation request</button>
  </form>
  <form className="space-y-3 rounded-xl bg-white p-5" onSubmit={e=>void submit(e,"reschedule")}>
   <h2 className="text-xl font-semibold">Request rescheduling</h2>
   <p>Use the existing appointment and preferred clinic branch above.</p>
   <label className="block">New date<input type="date" required className="text-input" value={newDate} onChange={e=>setNewDate(e.target.value)}/></label>
   <label className="block">New time (optional)<input type="time" className="text-input" value={newTime} onChange={e=>setNewTime(e.target.value)}/></label>
   <button disabled={busy} className="button-primary" type="submit">Send rescheduling request</button>
  </form>
  <section className="space-y-3 rounded-xl bg-white p-5">
   <h2 className="text-xl font-semibold">My change requests</h2>
   {history.length===0?<p className="text-slate-600">No cancellation or rescheduling requests yet.</p>:
    <ul className="space-y-2">{history.map(h=><li key={h.id} className="border-b pb-2">
     <strong>{h.request_type==="cancel"?"Cancellation":"Rescheduling"}</strong> · {h.status}
     {h.requested_date?<span> · {h.requested_date}</span>:null}
    </li>)}</ul>}
  </section>
 </div></main>;
}
