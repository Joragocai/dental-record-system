import React from "react";
import { Link } from "react-router-dom";
import type { SchedulingBranch } from "../appointments/appointmentApi.js";
import type { DentistDashboardAccess, DentistDaySummary } from "../dashboard/dentistDashboardData.js";

export interface DentistDashboardViewProps {
  access: DentistDashboardAccess | null;
  branches: SchedulingBranch[];
  branchId: string;
  businessDate: string;
  summary: DentistDaySummary | null;
  verifying: boolean;
  loading: boolean;
  notice: string;
  setBranch(id: string): void;
  setBusinessDate(date: string): void;
}

const titles = [
  ["Confirmed", "confirmed"],
  ["Checked in", "checkedIn"],
  ["In progress", "inProgress"],
  ["Completed", "completed"],
  ["Awaiting confirmation", "pendingConfirmation"]
] as const;

export default function DentistDashboardView({
  access, branches, branchId, businessDate, summary, verifying, loading, notice,
  setBranch, setBusinessDate
}: DentistDashboardViewProps) {
  const branchSelected = access !== null && access.branchIds.includes(branchId) &&
    branches.some((branch) => branch.id === branchId);
  return <main className="min-h-screen bg-slate-100 p-4 text-slate-900 sm:p-6">
    <div className="mx-auto max-w-5xl space-y-5">
      <Link className="text-sm font-medium text-clinic-700" to="/dashboard">← Secure dashboard</Link>
      <header>
        <p className="text-sm font-medium text-slate-500">Clinical operations</p>
        <h1 className="text-2xl font-bold">Dentist workspace</h1>
        <p className="mt-1 text-sm text-slate-600">Only appointments assigned to your account in the selected clinic branch and date are summarized.</p>
      </header>
      {notice && <p role="alert" className="rounded-xl border border-amber-200 bg-white p-4">{notice}</p>}
      {verifying && <p role="status">Checking your Dentist role and current clinic assignments...</p>}
      {!verifying && !access && <p role="status">Dentist dashboard access is unavailable. Your role, permissions, or branch assignments may have changed.</p>}
      {access && <>
        <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
          <label className="text-sm font-medium">Authorized clinic branch
            <select className="text-input mt-1" value={branchId} onChange={(event) => setBranch(event.target.value)}>
              <option value="">Select a branch</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.branchName} ({branch.branchCode})</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Clinic date (Philippines)
            <input className="text-input mt-1" type="date" value={businessDate}
              onChange={(event) => setBusinessDate(event.target.value)} />
          </label>
        </section>
        {branches.length === 0 && <p role="status">No scheduling branch is currently assigned to your Dentist account.</p>}
        {branchSelected && <>
          {loading && <p role="status">Loading your authorized schedule...</p>}
          {!loading && <section aria-label="Assigned appointment status" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {titles.map(([title, key]) => <article className="rounded-xl border border-slate-200 bg-white p-4" key={key}>
              <h2 className="text-sm font-medium text-slate-600">{title}</h2>
              <p className="mt-2 text-2xl font-semibold">{summary ? summary[key] : "Unavailable"}</p>
            </article>)}
          </section>}
          {!loading && <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Next timed appointment on selected date</h2>
            <p className="mt-2 font-medium">{summary
              ? summary.nextSlot ? `${summary.nextSlot.time} — ${summary.nextSlot.status === "checked_in" ? "Checked in" : "Confirmed"}`
                : "No remaining timed confirmed or checked-in slot for this date."
              : "Unavailable"}</p>
            {summary && summary.upcomingSlots.length > 0 && <ol className="mt-3 space-y-2 text-sm text-slate-700">
              {summary.upcomingSlots.map((slot, index) =>
                <li key={index}>{slot.time} · {slot.status === "checked_in" ? "Checked in" : "Confirmed"}</li>)}
            </ol>}
            <p className="mt-3 text-xs text-slate-500">At most five upcoming slots on the selected date. This is not a multi-day availability forecast. No patient names, medical alerts, or clinical notes appear here.</p>
          </section>}
        </>}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Authorized clinical workflows</h2>
          <nav className="mt-3 flex flex-wrap gap-3" aria-label="Dentist shortcuts">
            <Link className="button-secondary" to="/appointments">Clinic appointment scheduler</Link>
            {access.patientLookup && <Link className="button-secondary" to="/appointments">Patient lookup in scheduler</Link>}
            {access.requestReview && <Link className="button-secondary" to="/clinic-patient-requests">Review appointment change requests</Link>}
          </nav>
          {(access.treatmentPublish || access.documentVisibility) && <p className="mt-4 text-sm text-slate-600">
            {access.treatmentPublish && "Treatment summary publication requires an approved V2 clinical-record editor. "}
            {access.documentVisibility && "Document visibility changes require an approved record-specific attachment interface. "}
            Neither workflow is available directly from this dashboard.
          </p>}
          <p className="mt-3 text-xs text-slate-500">A protected V2 clinical record list and medical-alert projection are not yet available, so the dashboard does not invent patient or treatment information.</p>
        </section>
      </>}
    </div>
  </main>;
}
