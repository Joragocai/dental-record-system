import { Link } from "react-router-dom";
import { DASHBOARD_SCHEDULE_ORIGIN, scheduleEntryDestination } from "../lib/dashboardSchedule";
import { displayNoFinalTime, displayPlannedProcedure, formatReadableDate } from "../lib/formatters";

// Compact mobile presentation of the same schedule rows shown in desktop tables.
// Each entire card is one accessible link; no nested link or click handler needed.
export default function ScheduleEntriesMobile({ items, emptyMessage, showDate = false }) {
  if (!items.length) {
    return <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const destination = scheduleEntryDestination(item);
        const isFollowUp = item.source_type === "treatment_follow_up";
        const content = (
          <>
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 break-words text-sm font-semibold text-slate-900">{item.patient_name}</p>
              {destination ? (
                <svg className="shrink-0 text-clinic-700" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              {showDate ? `${formatReadableDate(item.schedule_date)} · ` : ""}{displayNoFinalTime(item.appointment_time)}
            </p>
            <p className="mt-2 break-words text-sm leading-relaxed text-slate-700">{displayPlannedProcedure(item.procedure_label)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-clinic-50 px-2 py-1 text-xs font-medium text-clinic-900">{isFollowUp ? `Follow-up · ${item.status || "Scheduled"}` : item.status || "Scheduled"}</span>
              {item.branch_location ? <span className="break-words text-xs text-slate-500">{item.branch_location}</span> : null}
            </div>
          </>
        );
        const key = `${item.source_type}-${item.source_id}-${item.schedule_date}`;
        const className = "block min-w-0 rounded-xl border border-slate-200 bg-white p-3.5 transition-colors duration-200 hover:border-clinic-500 hover:bg-clinic-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clinic-700";
        return destination ? (
          <Link key={key} to={destination} state={DASHBOARD_SCHEDULE_ORIGIN} className={className} aria-label={`Open ${item.patient_name}'s ${isFollowUp ? "treatment follow-up" : "appointment"}`}>
            {content}
          </Link>
        ) : (
          <div key={key} className="rounded-xl border border-slate-200 bg-white p-3.5">{content}</div>
        );
      })}
    </div>
  );
}
