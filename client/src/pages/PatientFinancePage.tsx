import {useEffect,useMemo,useState} from "react";
import {Link} from "react-router-dom";
import {useAuth} from "../context/AuthContext.js";
import {authenticatedV2Fetch} from "../auth/authApi.js";
interface Balance {invoiced:string;outstanding:string;note:string;ledgerOnly:boolean}
interface Payment {id:string;date:string;amount:string;method:string;status:string}
export default function PatientFinancePage(){
 const auth=useAuth(),opts=useMemo(()=>auth.providerSession?.accessToken&&auth.apiBaseUrl?
  {accessToken:auth.providerSession.accessToken,apiBaseUrl:auth.apiBaseUrl}:null,
  [auth.providerSession?.accessToken,auth.apiBaseUrl]);
 const [balance,setBalance]=useState<Balance|null>(null);
 const [payments,setPayments]=useState<Payment[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{
  setBalance(null);setPayments([]);setError("");setLoading(true);
  if(!opts){setLoading(false);return}
  let active=true;
  void Promise.all([authenticatedV2Fetch("/me/balance",{},opts),authenticatedV2Fetch("/me/payments",{},opts)])
   .then(async([b,p])=>{if(!b.ok||!p.ok)throw Error();const data=await Promise.all([b.json(),p.json()]);
    if(active){setBalance(data[0]);setPayments(data[1])}})
   .catch(()=>{if(active)setError("Finance information is unavailable. Contact the clinic for an up-to-date statement.")})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[opts]);
 return <main className="min-h-screen bg-slate-50 p-5"><div className="mx-auto max-w-3xl space-y-5">
 <Link to="/patient-portal" className="text-clinic-700">← Patient portal</Link>
 <h1 className="text-2xl font-bold">My financial records</h1>
 {loading?<p>Loading authorized finance records…</p>:null}
 {error?<p role="alert" className="text-red-700">{error}</p>:null}
 {balance?<section className="rounded-xl bg-white p-5 space-y-2">
  <h2 className="font-semibold">Finalized invoice balance</h2>
  <p>Invoiced: ₱{balance.invoiced}</p><p>Outstanding: ₱{balance.outstanding}</p>
  <p className="text-sm text-slate-600">{balance.note}</p>
  </section>:null}
 <section className="rounded-xl bg-white p-5"><h2 className="font-semibold">Internal payment history</h2>
  {payments.length===0?<p className="mt-2 text-slate-600">No recorded payments in the new ledger.</p>:
   <ul className="space-y-3">{payments.map(p=><li className="border-b py-2" key={p.id}>
    <span>{p.date.slice(0,10)} · {p.method} · ₱{p.amount} · {p.status}</span>
   </li>)}</ul>}
  <p className="mt-3 text-sm text-slate-600">This page is not an official receipt or legally issued invoice. For historical balances or corrections, contact your clinic.</p>
 </section></div></main>
}
