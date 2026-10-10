import React from "react";
import { Link } from "react-router-dom";
import type { TechnicalAccess, TechnicalStatus } from "../dashboard/systemAdministratorData.js";

interface Props { access:TechnicalAccess|null; status:TechnicalStatus|null; busy:boolean; error:string }
export default function SystemAdministratorDashboardView({access,status,busy,error}:Props){
 return <main className="min-h-screen bg-slate-100 p-4 text-slate-900 sm:p-6">
  <div className="mx-auto max-w-4xl space-y-5">
   <Link to="/dashboard" className="text-sm font-medium">← Secure dashboard</Link>
   <header><h1 className="text-2xl font-bold">System administration</h1>
    <p className="mt-1 text-sm text-slate-600">Technical-only monitoring. No clinical, patient, financial or account identity details are shown.</p></header>
   {busy&&<p role="status">Verifying current technical authorization and backend readiness...</p>}
   {error&&<p role="alert" className="rounded-xl border border-amber-200 bg-white p-4">{error}</p>}
   {!busy&&!access&&<p role="status">System Administrator dashboard access is unavailable.</p>}
   {access&&status&&<div className="space-y-4">
    <section aria-label="Protected technical status" className="grid gap-3 sm:grid-cols-2">
     <article className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-medium text-slate-600">Protected API status</h2>
      <p className="mt-2 text-xl font-semibold">Reachable</p>
     </article>
     <article className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-medium text-slate-600">Hosted service readiness</h2>
      <p className="mt-2 text-xl font-semibold">{status.readiness==="ready"?"Ready":"Unavailable"}</p>
      <p className="mt-2 text-xs text-slate-600">A general readiness check, not a detailed storage or backup integrity assessment.</p>
     </article>
    </section>
    <section className="rounded-xl border border-slate-200 bg-white p-5">
     <h2 className="text-lg font-semibold">Permitted technical responsibilities</h2>
     <p className="mt-2 text-sm text-slate-600">Technical account-support permission: {access.technicalAccountRead?"Granted":"Unavailable"}; role-definition configuration permission: {access.roleDefinitionsConfigure?"Granted":"Not granted"}. Permission does not authorize self-provisioning or changes without clinic approval.</p>
     <p className="mt-3 text-sm text-slate-600">Account-support forms, migration tools, backup/restore, diagnostic logs and recovery functions are not provided in this phase. No fictitious status or counts are shown.</p>
    </section>
   </div>}
  </div>
 </main>;
}
