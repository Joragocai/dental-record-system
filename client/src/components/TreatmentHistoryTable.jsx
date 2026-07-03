import { Link } from "react-router-dom";

export default function TreatmentHistoryTable({ treatments }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-slate-600">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Procedure</th>
            <th className="px-4 py-3">Dentist/s</th>
            <th className="px-4 py-3">Treatment ID</th>
            <th className="px-4 py-3">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {treatments.map((treatment) => (
            <tr key={treatment.treatment_id}>
              <td className="px-4 py-3">{treatment.treatment_date}</td>
              <td className="px-4 py-3">{treatment.procedure}</td>
              <td className="px-4 py-3">{treatment.dentists}</td>
              <td className="px-4 py-3">{treatment.treatment_id}</td>
              <td className="px-4 py-3">
                <Link to={`/treatments/${treatment.treatment_id}`} className="button-secondary">
                  Load Treatment
                </Link>
              </td>
            </tr>
          ))}
          {!treatments.length && (
            <tr>
              <td className="px-4 py-4 text-slate-500" colSpan="5">
                No treatment records yet for this patient.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
