import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { balanceViewFromSearchParams, balancesBackDestination, balancesDetailState, balanceSourceLabel } from "../lib/balanceNavigation";
import Layout from "../components/Layout";
import { getBalancesReport } from "../lib/api";
import { subscribeToFinanceChanges } from "../lib/financeRealtime";
import { balanceFilters, filterAndSortBalances, getBalancesEmptyState } from "../lib/financialView";
import { formatPesoAmount, formatReadableDate } from "../lib/formatters";

const statusTone = {
  "Settled": "bg-emerald-50 text-emerald-800 ring-emerald-200",
  "Partially Paid": "bg-amber-50 text-amber-800 ring-amber-200",
  "Unpaid": "bg-rose-50 text-rose-800 ring-rose-200"
};

function Status({ value }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusTone[value] || "bg-slate-100 text-slate-700 ring-slate-200"}`}>{value}</span>;
}

function BalanceCard({ row, detailsState }) {
  return <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <Link className="break-words font-bold text-clinic-900 hover:underline" to={`/patients/${row.patient_id}`}>{row.patient_name}</Link>
        <p className="mt-0.5 text-xs text-slate-500">{row.patient_id} · {row.treatment_id}</p>
      </div>
      <Status value={row.payment_status}/>
    </div>
    <p className="mt-3 break-words text-sm font-semibold text-slate-800">{row.procedure}</p>
    <p className="mt-1 text-xs text-slate-500">Treatment date: {formatReadableDate(row.treatment_date)}</p>
    <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3">
      {[[ "Net Due", row.net_amount_due ],[ "Paid", row.amount_paid ],[ "Balance", row.balance ]].map(([label, amount]) =>
        <div className="min-w-0" key={label}><dt className="text-[11px] text-slate-500">{label}</dt><dd className={`mt-1 break-words text-xs font-bold sm:text-sm ${label === "Balance" ? "text-clinic-900" : "text-slate-800"}`}>{formatPesoAmount(amount)}</dd></div>
      )}
    </dl>
    <Link to={`/treatments/${row.treatment_id}#payments`} state={detailsState} className="button-primary mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2">View Payment Details <span aria-hidden="true">→</span></Link>
  </article>;
}

export default function BalancesPage() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const view = balanceViewFromSearchParams(params);
  const { patientId, query, status: filter, sort } = view;
  const patientMode = Boolean(patientId);
  const updateView = (updates) => setParams((previous) => { const next = new URLSearchParams(previous); for (const [key,value] of Object.entries(updates)) { if (value) next.set(key,value); else next.delete(key); } return next; }, { replace: true, state: location.state });
  const [report, setReport] = useState({ summary: {}, records: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async ({ initial = false } = {}) => {
    if (initial) setLoading(true);
    try {
      setReport(await getBalancesReport());
      setError("");
    } catch {
      setError("Unable to load balances. Check the server connection, then retry.");
    } finally {
      if (initial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe;
    const update = () => {
      if (active) reload();
    };
    reload({ initial: true });
    subscribeToFinanceChanges(update).then((stop) => {
      if (active) unsubscribe = stop;
      else stop();
    }).catch(() => {
      // Socket.IO is optional until npm dependencies are installed.
      // Focus/visibility and page navigation still refresh the data.
    });
    const onFocus = () => { if (document.visibilityState === "visible") update(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      active = false;
      unsubscribe?.();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [reload]);

  const rows = useMemo(() => filterAndSortBalances(report.records, { query, filter, sort, patientId }), [report.records, query, filter, sort, patientId]);
  const patientRows = useMemo(() => report.records.filter((row) => row.patient_id === patientId), [report.records, patientId]);
  const selectedPatient = patientRows[0];
  const emptyState = getBalancesEmptyState({ patientMode, query, filter });
  const patientSummary = {
    netDue: patientRows.reduce((sum, row) => sum + Number(row.net_amount_due || 0), 0),
    paid: patientRows.reduce((sum, row) => sum + Number(row.amount_paid || 0), 0),
    outstanding: patientRows.reduce((sum, row) => sum + Number(row.balance || 0), 0),
    open: patientRows.filter((row) => Number(row.balance) > 0).length
  };
  const detailsState = balancesDetailState(location);
  const backTo = balancesBackDestination(location.state?.backTo, patientId);
  const stats = [
    ["Total Outstanding", formatPesoAmount(report.summary.outstanding_total || 0), "bg-clinic-900 text-white", "text-clinic-100"],
    ["Patients with Balance", report.summary.patients_with_balance || 0, "bg-white text-slate-900", "text-slate-500"],
    ["Open Treatments", report.summary.treatments_with_balance || 0, "bg-white text-slate-900", "text-slate-500"],
    ["Settled Treatments", report.summary.settled_treatments || 0, "bg-white text-slate-900", "text-slate-500"]
  ];

  return <Layout contentClassName="record-detail-wide-shell">
    {patientMode && <div className="no-print mb-3"><Link to={backTo} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-clinic-700 hover:bg-clinic-50 hover:underline">← Back to {balanceSourceLabel(backTo.pathname)}</Link></div>}
    <section className="page-card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.19em] text-clinic-700">Finance / Clinic Overview</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">{patientMode ? `Patient Balances${selectedPatient ? ` — ${selectedPatient.patient_name}` : ""}` : "Treatment Balances"}</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">{patientMode ? `All payment accounts for ${patientId}, including settled treatments. Each payment is tied to its treatment.` : "Find a patient’s outstanding treatments, review what has been paid, and open the transaction history for the exact treatment."}</p>
        </div>

      </div>
      {patientMode ? <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">{[["Patient Outstanding", formatPesoAmount(patientSummary.outstanding)],["Net Treatment Charges", formatPesoAmount(patientSummary.netDue)],["Total Paid",formatPesoAmount(patientSummary.paid)],["Treatments with Balance",patientSummary.open]].map(([label,value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs text-slate-600">{label}</p><p className="mt-2 break-words text-xl font-bold text-clinic-900">{value}</p></div>)}</div> : <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map(([label, value, style, labelStyle]) => <div key={label} className={`min-w-0 rounded-2xl border border-slate-200/80 p-4 shadow-sm ${style}`}>
          <p className={`text-xs font-medium ${labelStyle}`}>{label}</p>
          <p className="mt-2 break-words text-xl font-bold tracking-tight sm:text-2xl">{value}</p>
        </div>)}
      </div>}
    </section>

    <section className="page-card mt-5 min-w-0">
      <h2 className="section-title">Treatment Accounts</h2>
      <div className={`mt-4 grid items-end gap-3 sm:grid-cols-2 ${patientMode ? "lg:grid-cols-[minmax(0,1fr)_minmax(11rem,13rem)]" : "lg:grid-cols-[minmax(0,1fr)_minmax(11rem,13rem)_minmax(11rem,13rem)]"}`}>
        <label className="block min-w-0 sm:col-span-2 lg:col-span-1"><span className="label-text">Search Patient or Treatment</span>
          <input className="text-input min-h-11 w-full" type="search" value={query} onChange={(event) => updateView({q:event.target.value})} placeholder="Name, patient ID, treatment ID, procedure, mobile number" />
        </label>
        {!patientMode && <label className="block min-w-0"><span className="label-text">Payment Status</span>
          <select className="select-input min-h-11 w-full" value={filter} onChange={(event) => updateView({status:event.target.value})}>
            {balanceFilters.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>}
        <label className="block min-w-0"><span className="label-text">Sort By</span>
          <select className="select-input min-h-11 w-full" value={sort} onChange={(event) => updateView({sort:event.target.value})}>
            <option value="balance">Highest Balance</option><option value="recent">Most Recent Treatment</option><option value="patient">Patient Name</option>
          </select>
        </label>
      </div>
      {error && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}<button type="button" onClick={() => reload()} className="ml-2 font-semibold underline">Retry</button></div>}
      {loading ? <p className="ui-loading mt-5 text-sm text-slate-500">Loading treatment balances...</p> : <>
        <div className="mt-4 max-h-[58vh] space-y-3 overflow-y-auto overscroll-contain pr-1 xl:hidden">{rows.map((row) => <BalanceCard key={row.treatment_id} row={row} detailsState={detailsState}/>)}</div>
        <div className="mt-4 hidden max-h-[55vh] min-w-0 overflow-auto overscroll-contain rounded-xl border border-slate-200 xl:block [scrollbar-gutter:stable]">
          <table className="w-full min-w-[1120px] table-fixed text-sm">
            <colgroup>
              <col className="w-[21%]" />
              <col className="w-[28%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[11%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-2.5 font-semibold">Patient</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Treatment / Date</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Net Due</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Paid</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Outstanding</th>
                <th scope="col" className="px-3 py-2.5 text-center font-semibold">Status</th>
                <th scope="col" className="px-3 py-2.5 text-center font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">{rows.map((row) => <tr key={row.treatment_id} className="hover:bg-clinic-50/40">
              <td className="px-3 py-2"><Link to={`/patients/${row.patient_id}`} className="block break-words font-semibold text-clinic-800 hover:underline">{row.patient_name}</Link><p className="mt-0.5 text-xs text-slate-500">{row.patient_id}</p></td>
              <td className="px-3 py-2"><p className="break-words font-medium">{row.procedure}</p><p className="mt-0.5 text-xs text-slate-500">{row.treatment_id} · {formatReadableDate(row.treatment_date)}</p></td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatPesoAmount(row.net_amount_due)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatPesoAmount(row.amount_paid)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums text-clinic-900">{formatPesoAmount(row.balance)}</td>
              <td className="px-3 py-2 text-center"><Status value={row.payment_status}/></td>
              <td className="px-3 py-2 text-center">
                <Link
                  to={`/treatments/${row.treatment_id}#payments`}
                  state={detailsState}
                  aria-label={`View payment details for ${row.patient_name}, ${row.procedure}, treatment ${row.treatment_id}`}
                  title="View Payment Details"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-[#285B55] transition-colors hover:border-[#285B55] hover:bg-clinic-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clinic-700"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </Link>
              </td>
            </tr>)}</tbody>
          </table>
        </div>
        {!rows.length && !error && (
          <div role="status" className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <p className="font-semibold text-slate-700">{emptyState.title}</p>
            <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">{emptyState.description}</p>
            {emptyState.showClearSearch && (
              <button type="button" className="button-secondary mt-3 min-h-10" onClick={() => updateView({ q: "" })}>Clear Search</button>
            )}
          </div>
        )}
      </>}
    </section>
  </Layout>;
}
