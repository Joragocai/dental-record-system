import { Link } from "react-router-dom";
import { displayNoFinalTime, displayPlannedProcedure, formatReadableDate } from "../lib/formatters";

export default function PatientAppointmentsTable({ patientId, appointments, onStatusChange, isUpdatingId = null, statusChangePending = false }) {
  if (!appointments.length) {
    return <p className="text-sm text-slate-500">No appointments recorded.</p>;
  }

  return (
    <div className="max-h-[400px] w-full overflow-auto rounded-2xl border border-slate-200">
      <table className="w-full min-w-[1120px] divide-y divide-slate-200 text-[15px]">
        <thead className="sticky top-0 z-10 bg-slate-50 text-left text-slate-600">
          <tr>
            <th scope="col" className="min-w-[135px] whitespace-nowrap px-4 py-3">Date</th>
            <th scope="col" className="min-w-[120px] whitespace-nowrap px-4 py-3">Time</th>
            <th scope="col" className="min-w-[200px] px-4 py-3">Planned Procedure</th>
            <th scope="col" className="min-w-[160px] px-4 py-3">Status</th>
            <th scope="col" className="min-w-[320px] px-4 py-3">Notes</th>
            <th scope="col" className="w-[176px] min-w-[176px] px-4 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {appointments.map((appointment) => (
            <tr key={appointment.id} className="patient-record-data-row">
              <td className="whitespace-nowrap px-4 py-3">{formatReadableDate(appointment.appointment_date)}</td>
              <td className="whitespace-nowrap px-4 py-3">{displayNoFinalTime(appointment.appointment_time)}</td>
              <td className="px-4 py-3 leading-relaxed">{displayPlannedProcedure(appointment.planned_procedure)}</td>
              <td className="px-4 py-3">
                <select
                  className="select-input min-w-[132px]"
                  value={appointment.status || "Scheduled"}
                  onChange={(event) => onStatusChange?.(appointment, event.target.value)}
                  disabled={statusChangePending || isUpdatingId !== null}
                >
                  {["Scheduled", "Completed", "Cancelled", "No-show"].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </td>
              <td className="break-words px-4 py-3 leading-relaxed text-slate-600 [overflow-wrap:anywhere]">{appointment.notes || "-"}</td>
              <td className="px-4 py-3 text-right">
                <Link className="button-secondary inline-flex min-h-10 w-36 items-center justify-center whitespace-nowrap px-3 py-2 text-sm" to={`/patients/${patientId}/appointments/${appointment.id}/edit`}>
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
