import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { displayNoFinalTime, displayPlannedProcedure, formatReadableDate } from "../lib/formatters";
import { DASHBOARD_SCHEDULE_ORIGIN, filterScheduleRows, isDirectScheduleRowClick, scheduleEntryDestination, SCHEDULE_STATUS_FILTERS } from "../lib/dashboardSchedule";
import ScheduleSizeIcon from "./ScheduleSizeIcon";
import ScheduleEntriesMobile from "./ScheduleEntriesMobile";

export function ScheduleTable({ items, emptyMessage, expanded = false, statusFilter = "Scheduled" }) {
  const navigate = useNavigate();
  const rows = expanded ? filterScheduleRows(items, statusFilter) : items;

  function openScheduleEntry(event, destination) {
    if (destination && isDirectScheduleRowClick(event)) {
      navigate(destination, { state: DASHBOARD_SCHEDULE_ORIGIN });
    }
  }
  return (
    <>
    <div className="mt-4 md:hidden"><ScheduleEntriesMobile items={rows} emptyMessage={emptyMessage} /></div>
    <div className={`mt-4 hidden w-full overflow-auto rounded-2xl border border-slate-200 md:block ${expanded ? "max-h-[65vh]" : "max-h-[320px]"}`}> 
      <table className="w-full min-w-[1080px] divide-y divide-slate-200 text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 text-left text-slate-600">
          <tr>{["Time", "Patient", "Procedure", "Source", "Status", "Contact", "Branch", "Action"].map((title) => (
            <th key={title} scope="col" className="whitespace-nowrap px-4 py-3">{title}</th>
          ))}</tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {rows.length ? rows.map((item) => {
            const destination = scheduleEntryDestination(item);
            return (
              <tr key={`${item.source_type}-${item.source_id}-${item.schedule_date}`} onClick={(event) => openScheduleEntry(event, destination)} className={`transition-colors duration-200 hover:bg-[#edf5f1] focus-within:bg-[#edf5f1] ${destination ? "cursor-pointer" : ""}`}>
                <td className="whitespace-nowrap px-4 py-3">{displayNoFinalTime(item.appointment_time)}</td>
                <td className="px-4 py-3 font-medium">
                  {destination ? <Link to={destination} state={DASHBOARD_SCHEDULE_ORIGIN} className="rounded text-clinic-700 underline-offset-4 hover:text-clinic-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-clinic-700">{item.patient_name}</Link> : item.patient_name}
                </td>
                <td className="px-4 py-3">{displayPlannedProcedure(item.procedure_label)}</td>
                <td className="px-4 py-3">{item.source_type === "appointment" ? "Scheduled Appointment" : "Follow-up from Treatment"}</td>
                <td className="px-4 py-3">{item.source_type === "treatment_follow_up" ? "Scheduled" : item.status || "-"}</td>
                <td className="whitespace-nowrap px-4 py-3">{item.mobile_number || "-"}</td>
                <td className="px-4 py-3">{item.branch_location || "-"}</td>
                <td className="px-4 py-3">{destination ? <Link to={destination} state={DASHBOARD_SCHEDULE_ORIGIN} className="button-secondary inline-flex min-h-10 items-center whitespace-nowrap hover:border-clinic-700 hover:bg-clinic-700 hover:text-white">{item.source_type === "appointment" ? "Edit Appointment" : "View Treatment"}</Link> : "-"}</td>
              </tr>
            );
          }) : <tr><td colSpan={8} className="px-4 py-4 text-slate-500">{emptyMessage}</td></tr>}
        </tbody>
      </table>
    </div>
    </>
  );
}

export default function ExpandedScheduleDialog({ title, selectedDate, items, loading, error, statusFilter, onStatusFilter, onClose }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function keydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCallback.current();
      }
      if (event.key === "Tab" && dialogRef.current) {
        const controls = [...dialogRef.current.querySelectorAll("button:not(:disabled), a[href], select:not(:disabled)")];
        if (!controls.length) return;
        if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls[controls.length - 1].focus(); }
        else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) { event.preventDefault(); controls[0].focus(); }
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", keydown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return createPortal(
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-6">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="expanded-schedule-title" className="flex max-h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="expanded-schedule-title" className="break-words text-xl font-bold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">{formatReadableDate(selectedDate)} · Full schedule view</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="button-secondary inline-flex h-11 w-11 shrink-0 items-center justify-center p-0 transition-colors duration-200 hover:border-clinic-700 hover:bg-clinic-700 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clinic-700" aria-label="Minimize full schedule" title="Minimize full schedule"><ScheduleSizeIcon expanded /></button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label htmlFor="expanded-schedule-status" className="text-sm font-medium text-slate-700">Status</label>
          <select id="expanded-schedule-status" className="select-input max-w-48" value={statusFilter} onChange={(event) => onStatusFilter(event.target.value)}>
            {SCHEDULE_STATUS_FILTERS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <span className="text-xs text-slate-500">{filterScheduleRows(items,statusFilter).length} entries</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {loading ? <p role="status" className="mt-4 text-sm text-slate-600">Loading full schedule...</p> : error ? <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p> : <ScheduleTable items={items} expanded statusFilter={statusFilter} emptyMessage="No matching schedule entries for this date." />}
        </div>
      </section>
    </div>, document.body
  );
}
