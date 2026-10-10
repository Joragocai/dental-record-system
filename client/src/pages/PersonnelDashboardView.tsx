import React from "react";
import { Link } from "react-router-dom";
import type { SchedulingBranch } from "../appointments/appointmentApi.js";
import {
  expenseCategories,
  type ExpenseDraft,
  type PersonnelAccess,
  type PersonnelSnapshot
} from "../dashboard/personnelDashboardData.js";

export interface PersonnelDashboardViewProps {
  access: PersonnelAccess | null;
  branches: SchedulingBranch[];
  branchId: string;
  businessDate: string;
  snapshot: PersonnelSnapshot | null;
  verifying: boolean;
  refreshing: boolean;
  notice: string;
  expenseDraft: ExpenseDraft;
  expenseSaving: boolean;
  expenseNotice: string;
  setBranch(id: string): void;
  setBusinessDate(date: string): void;
  setExpenseDraft(draft: ExpenseDraft): void;
  submitExpense(): void;
}

export default function PersonnelDashboardView({
  access, branches, branchId, businessDate, snapshot,
  verifying, refreshing, notice, expenseDraft, expenseSaving, expenseNotice,
  setBranch, setBusinessDate, setExpenseDraft, submitExpense
}: PersonnelDashboardViewProps) {
  const selectedBranch = access !== null && branches.some((branch) => branch.id === branchId);
  const stats = snapshot?.appointments;
  return <main className="min-h-screen bg-slate-100 p-4 text-slate-900 sm:p-6">
    <div className="mx-auto max-w-5xl space-y-5">
      <Link to="/dashboard" className="text-sm font-medium text-clinic-700">← Secure dashboard</Link>
      <header>
        <h1 className="text-2xl font-bold">Personnel workspace</h1>
        <p className="mt-1 text-sm text-slate-600">Authorized branch operations. Choose a clinic and date to view live operational information.</p>
      </header>
      {notice && <p role="alert" className="rounded-xl border border-amber-200 bg-white p-4">{notice}</p>}
      {verifying && <p role="status">Verifying your current Personnel permissions...</p>}
      {!verifying && !access && <p role="status">This workspace is unavailable for your current role or branch assignment.</p>}
      {access && <>
        <section className="grid gap-3 rounded-xl bg-white p-5 sm:grid-cols-2">
          <label className="text-sm font-medium">Assigned clinic branch
            <select className="text-input mt-1" value={branchId} onChange={(event) => setBranch(event.target.value)}>
              <option value="">Select assigned branch</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.branchName} ({branch.branchCode})</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Philippine clinic date
            <input className="text-input mt-1" type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} />
          </label>
        </section>
        {branches.length === 0 && <p role="status">No authorized clinic scheduling branch is assigned.</p>}
        {selectedBranch && <>
          {refreshing && <p role="status">Loading authorized branch summaries...</p>}
          {!refreshing && <section aria-label="Branch appointment activity" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {([
              ["Confirmed appointments", stats?.confirmed],
              ["Checked-in appointments", stats?.checkedIn],
              ["Unconfirmed appointments", stats?.unconfirmed],
              ["Pending patient change requests", access.requestReview ? snapshot?.pending?.count : undefined]
            ] as const).filter(([title]) => title !== "Pending patient change requests" || access.requestReview)
              .map(([title, value]) => <article key={title} className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="text-sm font-medium text-slate-600">{title}</h2>
                <p className="mt-2 text-2xl font-semibold">{typeof value === "number" ? value : "Unavailable"}</p>
                {title === "Pending patient change requests" && snapshot?.pending?.limitReached &&
                  <p className="mt-2 text-xs text-amber-700">Only the first 100 pending requests are counted.</p>}
              </article>)}
          </section>}
          {access.dailyFinanceRead && <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Internal branch finance snapshot</h2>
            <p className="mt-1 text-sm text-slate-600">Limited internal ledger snapshot, not an accounting statement or official receipt. Receipts are gross before reversals and refunds; direct expense payments are not integrated.</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              {([
                ["Gross cash receipts on selected date", snapshot?.finance?.cashCollected],
                ["Gross digital receipts on selected date", snapshot?.finance?.digitalCollected],
                ["Current outstanding receivables for branch", snapshot?.finance?.outstandingReceivables]
              ] as const).map(([label, value]) => <div key={label}>
                <dt className="text-sm text-slate-600">{label}</dt>
                <dd className="mt-1 font-semibold">{value === undefined || value === null ? "Unavailable" : `₱${value}`}</dd>
              </div>)}
            </dl>
          </section>}
        </>}
        <section className="rounded-xl bg-white p-5">
          <h2 className="text-lg font-semibold">Authorized workflows</h2>
          <nav aria-label="Personnel shortcuts" className="mt-3 flex flex-wrap gap-3">
            <Link className="button-secondary" to="/appointments">Appointment scheduler</Link>
            {access.patientLookup && <Link className="button-secondary" to="/appointments">Patient lookup in scheduler</Link>}
            {access.requestReview && <Link className="button-secondary" to="/clinic-patient-requests">Review patient change requests</Link>}
            {access.dailyFinanceRead && <Link className="button-secondary" to="/clinic-finance">Detailed internal daily finance</Link>}
          </nav>
          {access.receivablesRead && !access.dailyFinanceRead &&
            <p className="mt-3 text-sm text-slate-600">Receivables permission is available, but the dedicated read-only listing page is not yet implemented.</p>}
        </section>
        {access.expenseCreate && selectedBranch && <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Submit an expense for approval</h2>
          <p className="text-sm text-slate-600">This records a pending expense only. No payment, cash disbursement, or accounting settlement is authorized.</p>
          {expenseNotice && <p role="status">{expenseNotice}</p>}
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); submitExpense(); }}>
            <label className="text-sm font-medium">Expense category
              <select required className="text-input mt-1" value={expenseDraft.categoryCode}
                onChange={(event) => setExpenseDraft({ ...expenseDraft, categoryCode: event.target.value })}>
                <option value="">Select category</option>
                {expenseCategories.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Amount (PHP)
              <input required className="text-input mt-1" inputMode="decimal" maxLength={16}
                value={expenseDraft.amount} onChange={(event) => setExpenseDraft({ ...expenseDraft, amount: event.target.value })} />
            </label>
            <label className="text-sm font-medium sm:col-span-2">Description
              <input required className="text-input mt-1" minLength={5} maxLength={500}
                value={expenseDraft.description} onChange={(event) => setExpenseDraft({ ...expenseDraft, description: event.target.value })} />
            </label>
            <button className="button-primary sm:col-span-2" type="submit" disabled={expenseSaving}>
              {expenseSaving ? "Submitting pending expense..." : "Submit pending expense"}
            </button>
          </form>
        </section>}
      </>}
    </div>
  </main>;
}
