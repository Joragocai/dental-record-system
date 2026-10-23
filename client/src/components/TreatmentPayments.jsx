import { useCallback, useEffect, useRef, useState } from "react";
import { getTreatmentPayments, recordTreatmentPayment, reverseTreatmentPayment } from "../lib/api";
import { getManilaTodayIso } from "../lib/clinicDate";
import PaymentConfirmationDialog from "./PaymentConfirmationDialog";
import { formatPesoAmount, formatReadableDate } from "../lib/formatters";

const methods = ["Cash", "GCash", "Bank Transfer", "Card", "Other"];
function makeRequestId() {
  return crypto.randomUUID();
}

export default function TreatmentPayments({ treatment, patientName, onUpdated }) {
  const treatmentId = treatment.treatment_id;
  const [payments, setPayments] = useState([]);
  const [balance, setBalance] = useState(treatment.balance);
  const [paid, setPaid] = useState(treatment.amount_paid);
  const [form, setForm] = useState({
    amount: "", payment_date: getManilaTodayIso(), payment_method: "Cash", reference: "", notes: ""
  });
  const [pending, setPending] = useState(null);
  const [paymentFormOpen, setPaymentFormOpen] = useState(false);
  const [expandedEntries, setExpandedEntries] = useState({});
  const [reverse, setReverse] = useState(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reversalId, setReversalId] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const workingRef = useRef(false);
  const latestRequestId = useRef("");

  const refresh = useCallback(async () => {
    const data = await getTreatmentPayments(treatmentId);
    setPayments(data.payments);
    setBalance(data.treatment.balance);
    setPaid(data.treatment.amount_paid);
    onUpdated?.(data.treatment);
  }, [treatmentId, onUpdated]);

  useEffect(() => {
    let active = true;
    getTreatmentPayments(treatmentId).then((data) => {
      if (!active) return;
      setPayments(data.payments);
      setBalance(data.treatment.balance);
      setPaid(data.treatment.amount_paid);
    }).catch(() => { if (active) setError("Unable to load payment history."); });
    return () => { active = false; };
  }, [treatmentId]);

  function change(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    latestRequestId.current = "";
    setError("");
    setMessage("");
  }

  function preparePayment(event) {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!/^\d+(?:\.\d{1,2})?$/.test(form.amount) || amount <= 0 || amount > Number(balance) ||
        !form.payment_date || form.payment_date < treatment.treatment_date ||
        form.payment_date > getManilaTodayIso() || !methods.includes(form.payment_method)) {
      setError("Enter a valid amount no greater than the remaining balance, and a valid payment date and method.");
      return;
    }
    setError("");
    setPending({ ...form, request_id: latestRequestId.current || makeRequestId() });
    if (!latestRequestId.current) latestRequestId.current = "";
  }

  async function confirmPayment() {
    if (!pending || workingRef.current) return;
    workingRef.current = true;
    setWorking(true);
    setError("");
    try {
      await recordTreatmentPayment(treatmentId, pending);
      setPending(null);
      setPaymentFormOpen(false);
      latestRequestId.current = "";
      setForm({ amount: "", payment_date: getManilaTodayIso(), payment_method: "Cash", reference: "", notes: "" });
      await refresh();
      setMessage("Payment recorded. Balance and history updated.");
    } catch (e) {
      latestRequestId.current = pending.request_id;
      setError(e.response?.data?.message || "Unable to record payment; please retry.");
    } finally {
      workingRef.current = false;
      setWorking(false);
    }
  }

  function startReverse(payment) {
    setReverse(payment);
    setReverseReason("");
    setReversalId(makeRequestId());
    setError("");
    setMessage("");
  }

  async function confirmReverse() {
    if (!reverse || reverseReason.trim().length < 8 || workingRef.current) return;
    workingRef.current = true;
    setWorking(true);
    setError("");
    try {
      await reverseTreatmentPayment(treatmentId, reverse.id, { reason: reverseReason.trim(), request_id: reversalId });
      setReverse(null);
      await refresh();
      setMessage("Payment reversed. The original transaction remains in history.");
    } catch (e) {
      setError(e.response?.data?.message || "Unable to reverse payment.");
    } finally {
      workingRef.current = false;
      setWorking(false);
    }
  }

  return (
    <section className="page-card mt-4 min-w-0 space-y-3 scroll-mt-6" id="payments">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-clinic-700">Financial Management</p><h2 className="mt-1 text-2xl font-bold text-slate-900">Payments & Transaction History</h2><p className="mt-1 break-words text-sm text-slate-600">{patientName} · {treatmentId}</p></div>{Number(balance) > 0 && <button className="button-primary inline-flex min-h-11 items-center justify-center self-start" type="button" onClick={() => { setPaymentFormOpen((value) => !value); setError(""); }}>{paymentFormOpen ? "Close Payment Form" : "+ Record Payment"}</button>}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{[["Net Amount Due", treatment.net_amount_due], ["Total Paid", paid], ["Remaining Balance", balance]].map(([label, amount]) => <div key={label} className={`min-w-0 rounded-xl border px-3 py-2.5 ${label === "Remaining Balance" ? "col-span-2 border-clinic-200 bg-clinic-50 sm:col-span-1" : "border-slate-200 bg-slate-50"}`}><p className="text-xs font-medium text-slate-600">{label}</p><p className="mt-1 break-words text-lg font-bold text-clinic-900 sm:text-xl">{formatPesoAmount(amount)}</p></div>)}</div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Treatment paid percentage" aria-valuenow={Number(treatment.net_amount_due) ? Math.round(Number(paid) / Number(treatment.net_amount_due) * 100) : 100} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-clinic-600 transition-all" style={{ width: `${Math.max(0, Math.min(100, Number(treatment.net_amount_due) ? Number(paid) / Number(treatment.net_amount_due) * 100 : 100))}%` }} /></div>
      {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {Number(balance) > 0 && paymentFormOpen && (
        <form onSubmit={preparePayment} className="rounded-xl border border-clinic-200 bg-clinic-50/50 p-3 sm:p-4">
          <h3 className="font-semibold text-clinic-900">Record Payment</h3>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <label><span className="label-text">Payment Amount (₱) *</span><input required className="text-input" type="number" min="0.01" step="0.01" max={balance} value={form.amount} onChange={(e) => change("amount", e.target.value)} /></label>
            <label><span className="label-text">Payment Date *</span><input required className="text-input" type="date" min={treatment.treatment_date} max={getManilaTodayIso()} value={form.payment_date} onChange={(e) => change("payment_date", e.target.value)} /></label>
            <label><span className="label-text">Payment Method *</span><select className="select-input" value={form.payment_method} onChange={(e) => change("payment_method", e.target.value)}>{methods.map((m) => <option key={m}>{m}</option>)}</select></label>
            <label><span className="label-text">Reference Number (optional)</span><input className="text-input" maxLength={120} value={form.reference} onChange={(e) => change("reference", e.target.value)} /></label>
            <label className="md:col-span-2"><span className="label-text">Remarks (optional)</span><textarea className="text-area w-full" maxLength={500} rows={2} value={form.notes} onChange={(e) => change("notes", e.target.value)} /></label>
          </div>
          <button type="submit" disabled={working} className="button-primary mt-4 min-h-11">Review Payment</button>
        </form>
      )}
      {Number(balance) === 0 && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800">This treatment is settled. No remaining payment is due.</p>}
      <div>
        <h3 className="text-lg font-semibold">Payment History</h3>
        <p className="mt-1 text-xs text-slate-500">Saved transactions cannot be edited or deleted. Incorrect entries use a documented reversal. Imported opening balances have no known payment date or method.</p>
        <div className="mt-2 space-y-2">
          {payments.map((p) => <article key={p.id} className="min-w-0 rounded-xl border border-slate-200 p-3 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="text-sm font-semibold">{p.transaction_number} · {p.source === "reversal" ? "Reversal" : p.source === "opening" ? "Historical Opening Payment" : p.source === "initial" ? "Initial Payment" : "Payment"}</p><p className="text-xs text-slate-500">{p.payment_date ? formatReadableDate(p.payment_date) : "Payment date not recorded"} · {p.payment_method}</p></div>
              <div className="text-right"><p className={`font-bold ${p.signed_amount < 0 ? "text-red-700" : "text-clinic-900"}`}>{p.signed_amount < 0 ? "−" : "+"}{formatPesoAmount(Math.abs(p.signed_amount))}</p><p className="text-xs text-slate-500">{p.status}</p></div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium text-slate-600">Balance after entry: {formatPesoAmount(p.balance_after)}</p><button type="button" className="min-h-10 rounded-lg px-2 text-xs font-semibold text-clinic-800 hover:bg-clinic-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clinic-700" aria-expanded={Boolean(expandedEntries[p.id])} onClick={() => setExpandedEntries((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}>{expandedEntries[p.id] ? "Hide Details ↑" : "Transaction Details ↓"}</button></div>
            {expandedEntries[p.id] && <div className="mt-2 space-y-1 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><p>Recorded: {new Date(p.created_at).toLocaleString("en-PH")}</p>{p.reference && <p>Reference: {p.reference}</p>}{p.notes && <p>Notes / correction reason: {p.notes}</p>}{p.reverses_payment_id && <p className="text-red-700">Reverses PAY-{String(p.reverses_payment_id).padStart(6, "0")}</p>}</div>}
            {["initial", "recorded"].includes(p.source) && p.status !== "Reversed" &&
              <button className="mt-2 min-h-10 rounded-lg border border-red-200 px-3 text-sm font-medium text-red-700 hover:bg-red-50" type="button" onClick={() => startReverse(p)} disabled={working}>Reverse Payment</button>}
          </article>)}
          {!payments.length && <p className="rounded-xl border border-slate-200 p-3 text-sm text-slate-500">No payments recorded for this treatment yet.</p>}
        </div>
      </div>
      {pending && <PaymentConfirmationDialog
        title="Confirm Payment"
        onCancel={() => { setPending(null); setError(""); }}
        onConfirm={confirmPayment}
        confirmLabel="Confirm Payment"
        busy={working}
        error={error}
      >
        <p className="font-medium text-slate-900">{patientName} · {treatmentId}</p>
        <p>Payment amount: <strong className="text-slate-900">{formatPesoAmount(pending.amount)}</strong></p>
        <p>Payment method: {pending.payment_method} · {formatReadableDate(pending.payment_date)}</p>
        <p>Projected balance: <strong className="text-clinic-900">{formatPesoAmount(Number(balance) - Number(pending.amount))}</strong></p>
      </PaymentConfirmationDialog>}
      {reverse && <PaymentConfirmationDialog
        title="Reverse Payment"
        onCancel={() => { setReverse(null); setError(""); }}
        onConfirm={confirmReverse}
        confirmLabel="Confirm Reversal"
        busy={working}
        confirmDisabled={reverseReason.trim().length < 8}
        destructive
        error={error}
      >
        <p className="font-semibold text-slate-900">{reverse.transaction_number} · {formatPesoAmount(reverse.amount)}</p>
        <p className="text-slate-600">The original transaction remains in the history. This does not issue an actual bank, card, or GCash refund.</p>
        <label className="block">
          <span className="label-text">Reason for reversal (required; 8+ characters)</span>
          <textarea className="text-area w-full" rows={3} maxLength={500} value={reverseReason} onChange={(e) => { setReverseReason(e.target.value); setError(""); }} />
        </label>
      </PaymentConfirmationDialog>}
    </section>
  );
}
