import { Link } from "react-router-dom";

export default function PatientSearchResults({ patients }) {
  return (
    <>
      {/* On smaller screens the entire card is one accessible navigation target. */}
      <div className="max-h-[70vh] min-w-0 space-y-3 overflow-y-auto overscroll-contain pr-1 lg:hidden" aria-label="Patient search results">
        {patients.map((patient) => (
          <Link
            key={patient.patient_id}
            to={`/patients/${patient.patient_id}`}
            className="group block min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 transition-colors duration-200 hover:border-clinic-500 hover:bg-clinic-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clinic-700 sm:p-4"
            aria-label={`Open patient record for ${patient.display_name}`}
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="break-words text-base font-semibold leading-snug text-slate-900 [overflow-wrap:anywhere]">{patient.display_name}</p>
                <p className="mt-1 text-xs font-medium text-clinic-700">Open Record</p>
              </div>
              <svg
                aria-hidden="true"
                className="mt-1 shrink-0 text-clinic-700 transition-transform duration-200 group-hover:translate-x-0.5"
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </div>
            <dl className="mt-3 grid min-w-0 grid-cols-2 gap-2">
              <div className="min-w-0">
                <dt className="text-xs text-slate-500">Patient ID</dt>
                <dd className="mt-0.5 break-words text-sm font-medium text-slate-800 [overflow-wrap:anywhere]">{patient.patient_id}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-slate-500">Mobile Number</dt>
                <dd className="mt-0.5 break-words text-sm font-medium text-slate-800 [overflow-wrap:anywhere]">{patient.mobile_number || "-"}</dd>
              </div>
            </dl>
          </Link>
        ))}
        {!patients.length && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">No patient records found.</p>
        )}
      </div>

      {/* The full table remains available when there is enough horizontal space. */}
      <div className="hidden max-h-[calc(100vh-260px)] min-w-0 w-full overflow-auto rounded-2xl border border-slate-200 lg:block">
        <table className="w-full min-w-[780px] divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-slate-600">
            <tr>
              <th scope="col" className="px-4 py-3">Patient</th>
              <th scope="col" className="whitespace-nowrap px-4 py-3">Patient ID</th>
              <th scope="col" className="whitespace-nowrap px-4 py-3">Mobile Number</th>
              <th scope="col" className="w-[155px] whitespace-nowrap px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {patients.map((patient) => (
              <tr key={patient.patient_id} className="transition-colors duration-200 hover:bg-clinic-50/50 focus-within:bg-clinic-50/50">
                <td className="break-words px-4 py-3 font-medium text-slate-900">{patient.display_name}</td>
                <td className="whitespace-nowrap px-4 py-3">{patient.patient_id}</td>
                <td className="whitespace-nowrap px-4 py-3">{patient.mobile_number || "-"}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <Link
                    className="button-secondary inline-flex min-h-11 items-center justify-center whitespace-nowrap"
                    to={`/patients/${patient.patient_id}`}
                  >
                    Open Record
                  </Link>
                </td>
              </tr>
            ))}
            {!patients.length && (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={4}>No patient records found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
