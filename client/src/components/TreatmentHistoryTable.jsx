import { Link } from "react-router-dom";
import { formatPesoAmount } from "../lib/formatters";

export default function TreatmentHistoryTable({ treatments, fullPage = false, originState }) {
  return (
    <div className={`w-full rounded-2xl border border-slate-200 ${fullPage ? "overflow-x-auto" : "max-h-[400px] overflow-auto"}`}>
      <table className={`w-full divide-y divide-slate-200 text-[15px] ${fullPage ? "min-w-[1150px]" : "min-w-[1380px]"}`}>
        <thead className="sticky top-0 z-10 bg-slate-50 text-left text-slate-600">
          <tr>
            <th scope="col" className={`${fullPage ? "min-w-[114px]" : "min-w-[125px]"} whitespace-nowrap px-4 py-3`}>Date</th>
            <th scope="col" className={`${fullPage ? "min-w-[175px]" : "min-w-[215px]"} px-4 py-3`}>Procedure</th>
            <th scope="col" className={`${fullPage ? "min-w-[130px]" : "min-w-[165px]"} px-4 py-3`}>Dentist/s</th>
            <th scope="col" className={`${fullPage ? "min-w-[125px]" : "min-w-[140px]"} whitespace-nowrap px-4 py-3`}>Treatment ID</th>
            <th scope="col" className={`${fullPage ? "min-w-[100px]" : "min-w-[112px]"} px-4 py-3`}>Charged</th>
            <th scope="col" className={`${fullPage ? "min-w-[100px]" : "min-w-[112px]"} px-4 py-3`}>Paid</th>
            <th scope="col" className={`${fullPage ? "min-w-[100px]" : "min-w-[112px]"} px-4 py-3`}>Balance</th>
            <th scope="col" className={`${fullPage ? "min-w-[145px]" : "min-w-[160px]"} px-4 py-3`}>Attachments</th>
            <th scope="col" className={`${fullPage ? "w-[160px] min-w-[160px]" : "w-[176px] min-w-[176px]"} px-4 py-3 text-right`}>Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {treatments.map((treatment) => (
            <tr key={treatment.treatment_id} className="patient-record-data-row">
              <td className="whitespace-nowrap px-4 py-3">{treatment.treatment_date}</td>
              <td className="break-words px-4 py-3 leading-relaxed">{treatment.procedure}</td>
              <td className="px-4 py-3">{treatment.dentists}</td>
              <td className="whitespace-nowrap px-4 py-3">{treatment.treatment_id}</td>
              <td className="whitespace-nowrap px-4 py-3">{formatPesoAmount(treatment.amount_charged)}</td>
              <td className="whitespace-nowrap px-4 py-3">{formatPesoAmount(treatment.amount_paid)}</td>
              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{formatPesoAmount(treatment.balance)}</td>
              <td className="px-4 py-3">
                {Number(treatment.attachment_count || 0) > 0 ? (
                  <Link to={`/treatments/${treatment.treatment_id}`} state={originState ? { ...originState, focusAttachments: true } : undefined} className="rounded text-clinic-700 underline underline-offset-2 hover:text-clinic-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clinic-700">
                    View Attachments ({treatment.attachment_count})
                  </Link>
                ) : (
                  <span className="text-slate-500">No attachments</span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <Link to={`/treatments/${treatment.treatment_id}`} state={originState} className={`button-secondary inline-flex min-h-10 items-center justify-center whitespace-nowrap px-3 py-2 text-sm ${fullPage ? "w-32" : "w-36"}`}>
                  Load Treatment
                </Link>
              </td>
            </tr>
          ))}
          {!treatments.length && (
            <tr>
              <td className="px-4 py-4 text-slate-500" colSpan="9">
                No treatment records yet for this patient.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
