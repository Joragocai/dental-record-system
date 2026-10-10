import React from "react";
import { Link } from "react-router-dom";
import type { ClinicAdministratorAccess, SafeAuditActivity } from "../dashboard/clinicAdministratorDashboardData.js";

interface Props { access: ClinicAdministratorAccess|null; activity: SafeAuditActivity[]|null; loading:boolean; message:string }
export default function ClinicAdministratorDashboardView({access,activity,loading,message}:Props){
 return <main className="min-h-screen bg-slate-100 p-4 text-slate-900 sm:p-6">
  <div className="mx-auto max-w-5xl space-y-5">
   <Link to="/dashboard" className="text-sm font-medium">← Secure dashboard</Link>
   <header><h1 className="text-2xl font-bold">Clinic administration</h1>
    <p className="mt-1 text-sm text-slate-600">Clinic-wide approvals, governance and restricted business oversight. Administrative authority is not clinical authority.</p></header>
   {loading&&<p role="status">Verifying administrator permissions and activity...</p>}
   {message&&<p role="alert" className="rounded-xl border border-amber-200 bg-white p-4">{message}</p>}
   {!loading&&!access&&<p role="status">This workspace is not available to your account.</p>}
   {access&&<div className="space-y-5">
    <section className="rounded-xl border bg-white p-5">
     <h2 className="text-lg font-semibold">Permission-verified administrative capabilities</h2>
     <dl className="mt-3 grid gap-3 sm:grid-cols-2">{([
      ["Staff account initiation",access.staffCreate&&access.roleApprove],
      ["Finance oversight permission",access.financialOversight],
      ["Expense approval authority",access.expenseApprove],
      ["Supplier bill approval authority",access.payableApprove],
      ["Independent cash-closing approval",access.closingApprove],
      ["Audit review",access.auditRead]
     ] as const).map(([title,allowed])=><div key={title} className="rounded-lg border border-slate-200 p-3">
      <dt className="font-medium">{title}</dt>
      <dd className="mt-1 text-sm text-slate-600">{allowed?"Authorized role capability — dedicated workflow availability varies":"Not authorized"}</dd>
     </div>)}</dl>
     <p className="mt-3 text-sm text-slate-600">Staff onboarding and finance approvals require their own verified records and protected interfaces. This page cannot approve unknown items or provision accounts automatically.</p>
    </section>
    {access.auditRead&&<section className="rounded-xl border bg-white p-5">
     <h2 className="text-lg font-semibold">Recent audited system actions</h2>
     <p className="mt-1 text-sm text-slate-600">Up to ten entries from the protected audit review API. Actor identity, target details, and metadata are not displayed in this summary.</p>
     {activity===null?<p className="mt-3" role="status">Audit activity unavailable.</p>:activity.length===0?
      <p className="mt-3">No audit entries returned by the protected service.</p>:
      <ul className="mt-3 space-y-2 text-sm">{activity.map((item,index)=><li key={index} className="rounded-lg border p-3">
       <p className="font-medium">{item.action.replaceAll("_"," ")}</p>
       <p className="text-sm text-slate-600">{new Date(item.occurredAt).toLocaleString("en-PH",{timeZone:"Asia/Manila"})} · {item.outcome}</p>
      </li>)}</ul>}
    </section>}
    <section className="rounded-xl border bg-white p-5">
     <h2 className="text-lg font-semibold">Business and recovery limits</h2>
     <p className="mt-2 text-sm text-slate-600">There is no approved clinic-wide financial aggregate, open approvals listing, or backup-restore approval workflow available for this dashboard. No cash, receivables, approval counts or backup status are estimated.</p>
    </section>
   </div>}
  </div>
 </main>;
}
