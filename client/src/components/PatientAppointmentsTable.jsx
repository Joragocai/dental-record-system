import { Link } from "react-router-dom";
import { displayNoFinalTime, displayPlannedProcedure, formatReadableDate } from "../lib/formatters";

export default function PatientAppointmentsTable({ patientId, appointments, onStatusChange, isUpdatingId = null }) {
  if (!appointments.length) {
    return <p className="text-sm text-slate-500">No appointments recorded.</p>;
  }

  return (
    <div className="max-h-[320px] overflow-auto rounded-2xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 text-left text-slate-600">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Time</th>
            <th className="px-4 py-3">Planned Procedure</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Notes</th>
            <th className="px-4 py-3">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {appointments.map((appointment) => (
            <tr key={appointment.id}>
              <td className="px-4 py-3">{formatReadableDate(appointment.appointment_date)}</td>
              <td className="px-4 py-3">{displayNoFinalTime(appointment.appointment_time)}</td>
              <td className="px-4 py-3">{displayPlannedProcedure(appointment.planned_procedure)}</td>
              <td className="px-4 py-3">
                <select
                  className="select-input min-w-[132px]"
                  value={appointment.status || "Scheduled"}
                  onChange={(event) => onStatusChange?.(appointment, event.target.value)}
                  disabled={isUpdatingId === appointment.id}
                >
                  {["Scheduled", "Completed", "Cancelled", "No-show"].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-4 py-3 text-slate-600">{appointment.notes || "-"}</td>
              <td className="px-4 py-3">
                <Link className="button-secondary px-3 py-2 text-xs" to={`/patients/${patientId}/appointments/${appointment.id}/edit`}>
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
