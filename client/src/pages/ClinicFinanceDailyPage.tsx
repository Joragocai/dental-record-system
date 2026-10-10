import {useEffect,useMemo,useState,type FormEvent} from "react";
import {Link} from "react-router-dom";
import {useAuth} from "../context/AuthContext.js";
import {authenticatedV2Fetch} from "../auth/authApi.js";
interface Branch {id:string;branchName:string}
interface Daily {
 servicesBilled:string;outstandingReceivables:string;newPayables:string;outstandingPayables:string;
 cashCollected:string;digitalCollected:string;cashReversals:string;digitalReversals:string;cashRefunds:string;
 digitalRefunds:string;cashSupplierPayments:string;digitalSupplierPayments:string;
 expensesPaidStatus:string;
}
export default function ClinicFinanceDailyPage(){
 const auth=useAuth();
 const opts=useMemo(()=>auth.providerSession?.accessToken&&auth.apiBaseUrl?
 {accessToken:auth.providerSession.accessToken,apiBaseUrl:auth.apiBaseUrl}:null,[auth.providerSession?.accessToken,auth.apiBaseUrl]);
 const [branches,setBranches]=useState<Branch[]>([]),[branch,setBranch]=useState("");
 const [date,setDate]=useState(new Date().toISOString().slice(0,10));
 const [snapshot,setSnapshot]=useState<Daily|null>(null),[notice,setNotice]=useState("");
 const [loading,setLoading]=useState(false);
 const [count,setCount]=useState(""),[opening,setOpening]=useState(""),[reason,setReason]=useState("");
 const [attest,setAttest]=useState(false),[closingId,setClosingId]=useState("");
 const [reviewReason,setReviewReason]=useState("");
 useEffect(()=>{if(!opts){setBranches([]);return}let active=true;
  void authenticatedV2Fetch("/appointments/scheduling-context",{},opts).then(async r=>{
   if(!r.ok)throw Error();const d=await r.json();if(active)setBranches(d.branches??[])
  }).catch(()=>{if(active)setNotice("Clinic branch access unavailable.")});
  return()=>{active=false}
 },[opts]);
 async function load(){
  if(!opts||!branch)return;
  setLoading(true);setNotice("");setSnapshot(null);
  try{const r=await authenticatedV2Fetch("/finance/daily-summary?branchId="+encodeURIComponent(branch)+"&businessDate="+encodeURIComponent(date),{},opts);
   if(!r.ok)throw Error();setSnapshot(await r.json());
  }catch{setNotice("Unable to load branch finance totals.")}finally{setLoading(false)}
 }
 async function send(path:string,body:Record<string,unknown>,ok:string){
  if(!opts)return;setLoading(true);setNotice("");
  try{const r=await authenticatedV2Fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)},opts);
   if(!r.ok)throw Error();const result=await r.json();if(result.id&&path.includes("daily-closings"))setClosingId(result.id);
   setNotice(ok);
  }catch{setNotice("Unable to complete the request. Confirm permissions and current cash reconciliation before retrying.")}
  finally{setLoading(false)}
 }
 async function report(){
  if(!opts||!branch)return;
  setLoading(true);setNotice("");
  try{const r=await authenticatedV2Fetch("/finance/reports/daily?branchId="+encodeURIComponent(branch)+"&businessDate="+encodeURIComponent(date),{},opts);
   if(!r.ok)throw Error();const csv=await r.text();const blob=new Blob([csv],{type:"text/csv"});
   const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download="internal-finance-"+date+".csv";link.click();URL.revokeObjectURL(link.href);
  }catch{setNotice("Report export is unavailable to this account.")}finally{setLoading(false)}
 }
 const fields:[string,string][] =snapshot?[
 ["Services billed",snapshot.servicesBilled],["Outstanding receivables",snapshot.outstandingReceivables],
 ["New approved payables",snapshot.newPayables],["Outstanding payables",snapshot.outstandingPayables],
 ["Cash collected",snapshot.cashCollected],["Digital/bank collections",snapshot.digitalCollected],
 ["Cash payment reversals",snapshot.cashReversals],["Digital payment reversals",snapshot.digitalReversals],["Cash refunds",snapshot.cashRefunds],
 ["Digital refunds",snapshot.digitalRefunds],["Cash supplier payments",snapshot.cashSupplierPayments],
 ["Digital supplier payments",snapshot.digitalSupplierPayments]
 ]:[];
 return <main className="min-h-screen bg-slate-50 p-5"><div className="mx-auto max-w-4xl space-y-6">
 <Link to="/appointments" className="text-clinic-700">← Clinic scheduler</Link>
 <header><h1 className="text-2xl font-bold">Daily finance and cash closing</h1>
 <p className="text-sm text-slate-600">Internal test ledger only. No statutory receipt or complete accounting statement is issued here.</p></header>
 <section className="space-y-3 rounded-xl bg-white p-5">
 <label className="block">Clinic branch<select className="text-input" value={branch} onChange={e=>{setBranch(e.target.value);setSnapshot(null)}}>
 <option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.branchName}</option>)}</select></label>
 <label className="block">Business date<input className="text-input" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
 <div className="flex flex-wrap gap-2"><button className="button-primary" type="button" disabled={!branch||loading} onClick={()=>void load()}>View summary</button>
 <button className="button-secondary" type="button" disabled={!snapshot||loading} onClick={()=>void report()}>Export internal CSV</button></div>
 </section>
 {notice?<p role="status" className="rounded-xl bg-white p-3">{notice}</p>:null}
 {snapshot?<section className="rounded-xl bg-white p-5"><h2 className="text-xl font-semibold">Ledger summary</h2>
  <dl className="mt-3 grid gap-3 sm:grid-cols-2">{fields.map(([name,value])=><div key={name}><dt className="text-sm text-slate-600">{name}</dt><dd className="font-semibold">₱{value}</dd></div>)}</dl>
  <p className="mt-4 text-sm text-amber-800">Direct expense payment records are not yet integrated. These figures must not be described as complete clinic profit or total net cash movement.</p>
 </section>:null}
 <section className="space-y-4 rounded-xl bg-white p-5"><h2 className="text-xl font-semibold">Opening cash authorization</h2>
 <p className="text-sm text-slate-600">Clinic Administrator approval is required. Register a documented opening float once per branch and date.</p>
 <label className="block">Opening cash (PHP)<input className="text-input" inputMode="decimal" value={opening} onChange={e=>setOpening(e.target.value)}/></label>
 <label className="block">Reason<input className="text-input" maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
 <button className="button-secondary" disabled={!branch||loading} onClick={()=>void send("/finance/opening-cash",{branchId:branch,businessDate:date,openingCash:opening,reason},"Opening cash authorization saved.")}>Authorize opening</button>
 </section>
 <section className="space-y-4 rounded-xl bg-white p-5"><h2 className="text-xl font-semibold">Submit cash closing</h2>
 <p className="text-sm text-slate-600">Only authorized personnel can submit. An actual cash count and full attestation are required; an unexplained discrepancy is rejected.</p>
 <label className="block">Actual cash count (PHP)<input className="text-input" inputMode="decimal" value={count} onChange={e=>setCount(e.target.value)}/></label>
 <label className="flex gap-2 items-start"><input type="checkbox" checked={attest} onChange={e=>setAttest(e.target.checked)}/>I attest all cash movements are included and checked.</label>
 <label className="block">Discrepancy reason (if any)<input className="text-input" maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
 <button className="button-primary" disabled={!branch||!attest||loading} onClick={()=>void send("/finance/daily-closings",{branchId:branch,businessDate:date,actualCash:count,cashMovementsAttested:attest,discrepancyReason:reason||null},"Cash closing submitted for independent review.")}>Submit closing</button>
 {closingId?<p className="text-sm">Pending closing ID: {closingId}. An independent Clinic Administrator must review it.</p>:null}
 </section>
 <section className="space-y-3 rounded-xl bg-white p-5">
  <h2 className="text-xl font-semibold">Independent closing review</h2>
  <p className="text-sm text-slate-600">Clinic Administrator-only action. You cannot approve your own submitted closing.</p>
  <label className="block">Closing UUID<input className="text-input" value={closingId} onChange={e=>setClosingId(e.target.value)} placeholder="Closing record UUID"/></label>
  <label className="block">Rejection reason (required for rejection)<input className="text-input" maxLength={500} value={reviewReason} onChange={e=>setReviewReason(e.target.value)}/></label>
  <div className="flex flex-wrap gap-2">
   <button className="button-primary" type="button" disabled={!closingId||loading} onClick={()=>void send("/finance/daily-closings/"+encodeURIComponent(closingId)+"/approve",{decision:"approved"},"Closing approved.")}>Approve</button>
   <button className="button-secondary" type="button" disabled={!closingId||loading||reviewReason.trim().length<5} onClick={()=>void send("/finance/daily-closings/"+encodeURIComponent(closingId)+"/approve",{decision:"rejected",reason:reviewReason},"Closing rejected with reason.")}>Reject</button>
  </div>
 </section></div></main>
}
