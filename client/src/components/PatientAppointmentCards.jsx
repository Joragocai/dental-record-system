import { Link } from "react-router-dom";
import { displayNoFinalTime, displayPlannedProcedure, formatReadableDate } from "../lib/formatters";

const appointmentStatuses = ["Scheduled", "Completed", "Cancelled", "No-show"];

// Compact appointment controls for phones. Status changes still go through
// PatientDetailPage's existing confirmation and backend validation.
export default function PatientAppointmentCards({ patientId, appointments, onStatusChange, isUpdatingId, statusChangePending }) {
  return (
    <div className="space-y-3 md:hidden">
      {appointments.map((appointment) => (
        <article key={appointment.id} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 sm:p-4">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-clinic-700">Appointment</p>
              <h3 className="mt-1 break-words text-base font-semibold leading-snug text-slate-900 [overflow-wrap:anywhere]">
                {displayPlannedProcedure(appointment.planned_procedure)}
              </h3>
            </div>
            <span className="max-w-full break-words rounded-lg bg-clinic-50 px-2.5 py-1 text-xs font-medium text-clinic-900">
              {appointment.status || "Scheduled"}
            </span>
          </div>

          <dl className="mt-3 grid min-w-0 grid-cols-2 gap-2">
            <div className="min-w-0 rounded-xl bg-white p-2.5">
              <dt className="text-xs text-slate-500">Date</dt>
              <dd className="mt-1 break-words text-sm font-medium text-slate-800">{formatReadableDate(appointment.appointment_date)}</dd>
            </div>
            <div className="min-w-0 rounded-xl bg-white p-2.5">
              <dt className="text-xs text-slate-500">Time</dt>
              <dd className="mt-1 break-words text-sm font-medium text-slate-800">{displayNoFinalTime(appointment.appointment_time)}</dd>
            </div>
          </dl>

          {appointment.notes ? (
            <div className="mt-3 min-w-0 text-sm">
              <p className="text-xs font-medium text-slate-500">Notes</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-slate-700 [overflow-wrap:anywhere]">{appointment.notes}</p>
            </div>
          ) : null}

          <div className="mt-4 grid min-w-0 grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-medium text-slate-600">Update status</span>
              <select
                className="select-input min-h-11 min-w-0 text-base"
                aria-label={`Update appointment status for ${formatReadableDate(appointment.appointment_date)}`}
                value={appointment.status || "Scheduled"}
                onChange={(event) => onStatusChange?.(appointment, event.target.value)}
                disabled={statusChangePending || isUpdatingId !== null}
              >
                {appointmentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <Link
              to={`/patients/${patientId}/appointments/${appointment.id}/edit`}
              className="button-secondary inline-flex min-h-11 min-w-0 items-center justify-center px-4 py-2.5"
            >
              Edit Appointment
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
