import { Link } from "react-router-dom";

export default function PatientSearchResults({ patients }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-slate-600">
          <tr>
            <th className="px-4 py-3">Patient</th>
            <th className="px-4 py-3">Patient ID</th>
            <th className="px-4 py-3">Mobile Number</th>
            <th className="px-4 py-3">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {patients.map((patient) => (
            <tr key={patient.patient_id}>
              <td className="px-4 py-3">{patient.display_name}</td>
              <td className="px-4 py-3">{patient.patient_id}</td>
              <td className="px-4 py-3">{patient.mobile_number || "-"}</td>
              <td className="px-4 py-3">
                <Link className="button-secondary" to={`/patients/${patient.patient_id}`}>
                  Open Record
                </Link>
              </td>
            </tr>
          ))}
          {!patients.length && (
            <tr>
              <td className="px-4 py-4 text-slate-500" colSpan="4">
                No patient records found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
