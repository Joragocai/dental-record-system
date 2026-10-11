import { Link } from "react-router-dom";
import { formatPesoAmount } from "../lib/formatters";
import { getTreatmentAttachmentOriginState } from "../lib/treatmentFormPresentation";

// Shared by Patient Record and the Record Treatment mobile history.
// The optional origin state preserves a draft when entering history from Record Treatment.
export default function PatientTreatmentCards({ treatments, originState }) {
  if (!treatments.length) return <p className="text-sm text-slate-500">No treatment records yet for this patient.</p>;

  return (
    <div className="space-y-3 md:hidden">
      {treatments.map((treatment) => (
        <article key={treatment.treatment_id} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 sm:p-4">
          <p className="break-words text-xs font-medium text-clinic-700">{treatment.treatment_date} · {treatment.treatment_id}</p>
          <h3 className="mt-1 break-words text-base font-semibold text-slate-900 [overflow-wrap:anywhere]">{treatment.procedure || "Treatment"}</h3>
          <p className="mt-2 break-words text-sm text-slate-600">Dentist/s: {treatment.dentists || "-"}</p>
          <dl className="mt-3 grid grid-cols-3 gap-1.5">
            {[
              ["Charged", treatment.amount_charged],
              ["Paid", treatment.amount_paid],
              ["Balance", treatment.balance]
            ].map(([label, amount]) => (
              <div key={label} className="min-w-0 rounded-lg bg-white px-2 py-2.5">
                <dt className="text-[11px] text-slate-500">{label}</dt>
                <dd className="mt-1 break-words text-xs font-semibold text-slate-900 [overflow-wrap:anywhere]">{formatPesoAmount(amount)}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {Number(treatment.attachment_count || 0) > 0 ? (
              <Link
                to={`/treatments/${treatment.treatment_id}`}
                state={getTreatmentAttachmentOriginState(originState)}
                className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-clinic-700 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clinic-700"
              >
                Attachments ({treatment.attachment_count})
              </Link>
            ) : <span className="text-xs text-slate-500">No attachments</span>}
            <Link to={`/treatments/${treatment.treatment_id}`} state={originState} className="button-secondary ml-auto inline-flex min-h-11 items-center justify-center">Load Treatment</Link>
          </div>
        </article>
      ))}
    </div>
  );
}
