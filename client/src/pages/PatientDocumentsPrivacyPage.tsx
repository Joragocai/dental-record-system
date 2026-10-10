import {useEffect,useMemo,useState} from "react";
import {Link,useNavigate} from "react-router-dom";
import {useAuth} from "../context/AuthContext.js";
import {authenticatedV2Fetch} from "../auth/authApi.js";
interface PortalDocument {id:string;filename:string;category:string;description:string|null;mimeType:string;sizeBytes:number;uploadedAt:string}
export default function PatientDocumentsPrivacyPage(){
 const auth=useAuth(),navigate=useNavigate();
 const options=useMemo(()=>auth.providerSession?.accessToken&&auth.apiBaseUrl?
  {accessToken:auth.providerSession.accessToken,apiBaseUrl:auth.apiBaseUrl}:null,
  [auth.providerSession?.accessToken,auth.apiBaseUrl]);
 const [documents,setDocuments]=useState<PortalDocument[]>([]);
 const [message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const [confirm,setConfirm]=useState(false);
 useEffect(()=>{
  setDocuments([]);setMessage("");
  if(!options)return;
  let active=true;
  void authenticatedV2Fetch("/me/documents",{},options).then(async r=>{
   if(!r.ok)throw Error();const list=await r.json();
   if(active)setDocuments(list);
  }).catch(()=>{if(active)setMessage("Documents are unavailable or your patient account is not authorized.")});
  return()=>{active=false};
 },[options]);
 async function download(id:string){
  if(!options||busy)return;
  setBusy(true);setMessage("");
  try{
   const r=await authenticatedV2Fetch("/me/documents/"+encodeURIComponent(id)+"/download-url",{method:"POST"},options);
   if(!r.ok)throw Error();
   const result:{signedUrl:string}=await r.json();
   const target=new URL(result.signedUrl);
   if(target.protocol!=="https:")throw Error();
   window.open(target.toString(),"_blank","noopener,noreferrer");
   setMessage("Download link opened. Private links expire shortly.");
  }catch{setMessage("This document cannot be downloaded. Contact the clinic if you need a copy.");}
  finally{setBusy(false)}
 }
 async function deactivate(){
  if(!options||busy||!confirm)return;
  setBusy(true);setMessage("");
  try{
   const r=await authenticatedV2Fetch("/me/account/deactivate",{method:"POST"},options);
   if(!r.ok)throw Error();
   await auth.logout();
   navigate("/login",{replace:true});
  }catch{setMessage("Account deactivation could not be confirmed. Please contact the clinic.");}
  finally{setBusy(false)}
 }
 return <main className="min-h-screen bg-slate-50 p-5"><div className="mx-auto max-w-3xl space-y-5">
  <header><Link to="/patient-portal" className="text-clinic-700">← My dental records</Link>
   <h1 className="mt-3 text-2xl font-bold">Documents and privacy</h1></header>
  {message?<p role="status" className="rounded-xl bg-white p-4">{message}</p>:null}
  <section className="space-y-3 rounded-xl bg-white p-5">
   <h2 className="text-xl font-semibold">Documents shared by your clinic</h2>
   <p className="text-sm text-slate-600">Only uploaded documents approved for your patient account appear here.</p>
   {documents.length===0?<p>No documents have been shared with you yet.</p>:
    <ul className="space-y-3">{documents.map(d=><li key={d.id} className="flex items-center justify-between gap-3 border-b py-2">
     <div className="min-w-0"><p className="break-words font-medium">{d.filename}</p>
      <p className="text-sm text-slate-600">{d.category} {d.description??""}</p></div>
     <button className="button-secondary" type="button" disabled={busy} onClick={()=>void download(d.id)}>Download</button>
    </li>)}</ul>}
  </section>
  <section className="space-y-3 rounded-xl bg-white p-5">
   <h2 className="text-xl font-semibold">Privacy and your records</h2>
   <p>Your account provides access only to your linked patient record and content the clinic has explicitly shared. Staff-only notes, unpublished treatment information and internal financial records are not shown.</p>
   <p>For corrections, access requests, a copy of records, or questions about data retention, contact your clinic directly. Requests are reviewed under the clinic's applicable privacy procedures.</p>
   <p>Financial balances and payment history are not yet available; they require the clinic's future finance module.</p>
  </section>
  <section className="space-y-3 rounded-xl bg-white p-5">
   <h2 className="text-xl font-semibold">Deactivate portal access</h2>
   <p>This disables your patient portal account. It does not delete medical records, cancel bookings, or erase legally required clinic records. Future reactivation requires the clinic's verified recovery process.</p>
   <label className="flex items-start gap-2"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/>
    <span>I understand I will lose access to my patient portal until the clinic reviews my account.</span></label>
   <button type="button" className="button-secondary" disabled={!confirm||busy} onClick={()=>void deactivate()}>Deactivate my portal access</button>
  </section>
  <button className="button-secondary" type="button" onClick={()=>void auth.logout().then(()=>navigate("/login",{replace:true}))}>Sign out securely</button>
 </div></main>;
}
