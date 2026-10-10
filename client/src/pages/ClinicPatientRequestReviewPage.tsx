import {useCallback,useEffect,useMemo,useState} from "react";
import {Link} from "react-router-dom";
import {useAuth} from "../context/AuthContext.js";
import {authenticatedV2Fetch} from "../auth/authApi.js";

interface Branch {id:string;branchName:string}
interface Dentist {id:string;displayName:string}
interface PendingChange {
 id:string;appointment_id:string;request_type:"cancel"|"reschedule";
 requested_date:string|null;requested_time:string|null;requested_branch_id:string|null;reason:string|null;
}
export default function ClinicPatientRequestReviewPage(){
 const auth=useAuth();
 const options=useMemo(()=>auth.providerSession?.accessToken&&auth.apiBaseUrl?
  {accessToken:auth.providerSession.accessToken,apiBaseUrl:auth.apiBaseUrl}:null,
  [auth.providerSession?.accessToken,auth.apiBaseUrl]);
 const [branches,setBranches]=useState<Branch[]>([]);
 const [branch,setBranch]=useState("");
 const [requests,setRequests]=useState<PendingChange[]>([]);
 const [dentistsByBranch,setDentistsByBranch]=useState<Record<string,Dentist[]>>({});
 const [dentist,setDentist]=useState("");
 const [duration,setDuration]=useState("30");
 const [time,setTime]=useState("");
 const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState("");
 useEffect(()=>{
  if(!options){setBranches([]);setBranch("");setRequests([]);return;}
  let active=true;
  void authenticatedV2Fetch("/appointments/scheduling-context",{},options)
   .then(async r=>{if(!r.ok)throw Error();return r.json()})
   .then(v=>{if(active)setBranches(v.branches)})
   .catch(()=>{if(active)setFeedback("Clinic scheduling access is unavailable.")});
  return()=>{active=false};
 },[options]);
 const refresh=useCallback(async()=>{
  if(!options||!branch)return;
  const response=await authenticatedV2Fetch("/patient-appointment-reviews?branchId="+encodeURIComponent(branch),{},options);
  if(!response.ok)throw Error();
  setRequests(await response.json());
 },[options,branch]);
 useEffect(()=>{
  setRequests([]);if(!options||!branch)return;
  let active=true;
  void authenticatedV2Fetch("/patient-appointment-reviews?branchId="+encodeURIComponent(branch),{},options)
   .then(async response=>{
    if(!response.ok)throw Error();
    const items:PendingChange[]=await response.json();
    const targetIds=[...new Set(items.filter(x=>x.request_type==="reschedule")
      .map(x=>x.requested_branch_id??branch))];
    const scheduleResults=await Promise.all(targetIds.map(async targetId=>{
     const r=await authenticatedV2Fetch("/appointments/scheduling-context?branchId="+encodeURIComponent(targetId),{},options);
     if(!r.ok)return [targetId,[]] as const;
     const data=await r.json();
     return [targetId,data.dentists??[]] as const;
    }));
    if(active){setRequests(items);setDentistsByBranch(Object.fromEntries(scheduleResults))}
   }).catch(()=>{if(active)setFeedback("Unable to load pending patient requests.")});
  return()=>{active=false};
 },[options,branch]);
 async function decide(item:PendingChange,decision:"approved"|"rejected"){
  if(!options||busy)return;
  setFeedback("");setBusy(true);
  const payload:Record<string,unknown>={decision};
  if(decision==="approved"&&item.request_type==="reschedule"){
   if(!dentist||!Number.isInteger(Number(duration))||Number(duration)<1||!time){
    setFeedback("Select a Dentist, appointment duration and confirmed time first.");setBusy(false);return;
   }
   payload.dentistUserId=dentist;payload.durationMinutes=Number(duration);payload.appointmentTime=time;
  }
  try{
   const response=await authenticatedV2Fetch("/patient-appointment-reviews/"+encodeURIComponent(item.id)+"/decision",
    {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)},options);
   if(!response.ok)throw Error();
   await refresh();
   setFeedback("Request "+decision+".");
  }catch{setFeedback("Review could not be completed. The request may still be pending; refresh before trying again.");}
  finally{setBusy(false)}
 }
 return <main className="min-h-screen bg-slate-50 p-5"><div className="mx-auto max-w-4xl space-y-5">
  <header className="space-y-2"><Link className="text-clinic-700" to="/appointments">← Appointment scheduler</Link>
   <h1 className="text-2xl font-bold">Patient change requests</h1>
   <p className="text-slate-600">Only authorized clinic staff can approve or reject pending changes.</p></header>
  {feedback?<p role="status" className="rounded-lg bg-white p-3">{feedback}</p>:null}
  <label className="block">Review clinic branch<select className="text-input" value={branch} onChange={e=>setBranch(e.target.value)}>
   <option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.branchName}</option>)}
  </select></label>
  <section className="grid gap-4">{requests.map(item=><article className="space-y-3 rounded-xl bg-white p-5 shadow-sm" key={item.id}>
   <h2 className="font-semibold">{item.request_type==="cancel"?"Cancellation request":"Rescheduling request"}</h2>
   <p className="text-sm">Appointment: {item.appointment_id}</p>
   {item.requested_date?<p>Preferred date: {String(item.requested_date).slice(0,10)} {item.requested_time??"Time to arrange"}</p>:null}
   {item.reason?<p>Reason: {item.reason}</p>:null}
   {item.request_type==="reschedule"?<div className="grid gap-3 sm:grid-cols-3">
    <label>Dentist<select className="text-input" value={dentist} onChange={e=>setDentist(e.target.value)}>
     <option value="">Select Dentist</option>{(dentistsByBranch[item.requested_branch_id??branch]??[]).map(d=><option key={d.id} value={d.id}>{d.displayName}</option>)}</select></label>
    <label>Confirmed time<input type="time" className="text-input" value={time} onChange={e=>setTime(e.target.value)}/></label>
    <label>Minutes<input type="number" min={1} max={1440} className="text-input" value={duration} onChange={e=>setDuration(e.target.value)}/></label>
   </div>:null}
   <div className="flex gap-2"><button disabled={busy} className="button-primary" onClick={()=>void decide(item,"approved")}>Approve</button>
    <button disabled={busy} className="button-secondary" onClick={()=>void decide(item,"rejected")}>Reject</button></div>
  </article>)}</section>
  {branch&&requests.length===0?<p>No pending change requests for this branch.</p>:null}
 </div></main>
}
