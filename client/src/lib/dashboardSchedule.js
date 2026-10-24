export const SCHEDULE_STATUS_FILTERS = ["All", "Scheduled", "Completed", "Cancelled", "No-show"];

// A fixed navigation marker is safer than relying on browser history or
// accepting arbitrary return URLs from route state.
export const DASHBOARD_SCHEDULE_ORIGIN = Object.freeze({ fromDashboardSchedule: true });

export function isDashboardScheduleOrigin(state) {
  return state?.fromDashboardSchedule === true;
}

export function isDirectScheduleRowClick(event) {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
  return !event.target?.closest?.("a, button, input, select, textarea, [role='button']");
}

export function scheduleEntryDestination(entry) {
  if (!entry?.patient_id) return null;
  if (entry.source_type === "appointment" && entry.source_id != null) {
    return `/patients/${encodeURIComponent(entry.patient_id)}/appointments/${encodeURIComponent(entry.source_id)}/edit`;
  }
  if (entry.source_type === "treatment_follow_up" && entry.treatment_record_id) {
    return `/treatments/${encodeURIComponent(entry.treatment_record_id)}`;
  }
  return `/patients/${encodeURIComponent(entry.patient_id)}`;
}

export function filterScheduleRows(items, status) {
  if (status === "All") return items;
  if (status === "Scheduled") return items.filter((entry) => entry.status === "Scheduled" || (entry.source_type === "treatment_follow_up" && !entry.status));
  return items.filter((entry) => entry.status === status);
}
