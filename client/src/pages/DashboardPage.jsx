import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import ExpandedScheduleDialog from "../components/ExpandedScheduleDialog";
import ScheduleSizeIcon from "../components/ScheduleSizeIcon";
import ScheduleEntriesMobile from "../components/ScheduleEntriesMobile";
import AppointmentSavedToast from "../components/AppointmentSavedToast";
import { appointmentSaveNotice, isAppointmentSaveNotice } from "../lib/appointmentSaveNotice";
import { DASHBOARD_SCHEDULE_ORIGIN, isDirectScheduleRowClick, scheduleEntryDestination } from "../lib/dashboardSchedule";
import { getDashboardSchedule, getDashboardScheduleByDate, getDashboardSummary } from "../lib/api";
import { displayNoFinalTime, displayPlannedProcedure, formatReadableDate } from "../lib/formatters";

const dashboardActions = [
  {
    to: "/treatments/new",
    kind: "treatment",
    category: "Treatment",
    title: "Record Treatment",
    description: "Add a clinical treatment",
    cardStyle: "bg-teal-700 text-white ring-teal-900/15 hover:bg-teal-800",
    accentStyle: "text-teal-100",
    iconStyle: "bg-white/15 text-white"
  },
  {
    to: "/patients",
    kind: "search",
    category: "Find",
    title: "Patient Search",
    description: "Find patient records",
    cardStyle: "bg-slate-900 text-white ring-slate-950/15 hover:bg-slate-800",
    accentStyle: "text-slate-300",
    iconStyle: "bg-white/15 text-white"
  },
  {
    to: "/patients/new",
    kind: "register",
    category: "Create",
    title: "Register Patient",
    description: "Create a new record",
    cardStyle: "bg-clinic-700 text-white ring-clinic-900/15 hover:bg-clinic-800",
    accentStyle: "text-clinic-100",
    iconStyle: "bg-white/15 text-white"
  },
  {
    to: "/balances",
    kind: "balance",
    category: "Finance",
    title: "View Balances",
    description: "Payments & receivables",
    cardStyle: "bg-[#36566A] text-white ring-slate-900/15 hover:bg-[#2C4858]",
    accentStyle: "text-[#C4DAE5]",
    iconStyle: "bg-white/15 text-white"
  }
];

function DashboardActionIcon({ kind }) {
  const iconPaths = {
    treatment: <><rect x="5" y="5" width="14" height="16" rx="2" /><path d="M9 5.5V3h6v2.5M12 10v7m-3.5-3.5h7" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    register: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M19 9v8m-4-4h8" /></>,
    balance: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18M16 15h2M7 6V4h11" /></>
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconPaths[kind]}</svg>;
}

function ClinicUiIcon({ kind, className = "h-5 w-5" }) {
  const paths = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18" /></>,
    followup: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M19 7v6m-3-3h6" /></>,
    patients: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m2 3c1.5.9 2 2.1 2 4" /></>,
    birthday: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18m-9 4v4m-2-2h4" /></>,
    person: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.3-4 2.7-6 7-6s6.7 2 7 6" /></>
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[kind]}
    </svg>
  );
}

function ScheduleStatus({ value }) {
  const text = String(value || "").trim() || "Not specified";
  const status = text.toLowerCase().replaceAll("_", " ");
  const isCompleted = ["completed", "checked in"].includes(status);
  const isPositive = ["scheduled", "confirmed"].includes(status);
  const isNegative = ["cancelled", "canceled"].includes(status);
  const isWarning = ["no show", "no-show"].includes(status);
  const style = isCompleted
    ? "bg-sky-50 text-sky-800"
    : isPositive
    ? "bg-emerald-50 text-emerald-800"
    : isNegative
      ? "bg-rose-50 text-rose-700"
      : isWarning
        ? "bg-amber-50 text-amber-800"
        : "bg-slate-100 text-slate-700";
  const dot = isCompleted ? "bg-sky-600" : isPositive ? "bg-emerald-600" : isNegative ? "bg-rose-600" : isWarning ? "bg-amber-600" : "bg-slate-500";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${style}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      {text}
    </span>
  );
}

function DashboardActionCard({ action }) {
  return (
    <Link
      to={action.to}
      className={`dashboard-action-card group flex h-full min-h-[154px] min-w-0 flex-col justify-between gap-3 rounded-2xl p-3.5 shadow-sm ring-1 transition-colors sm:p-4 2xl:min-h-[166px] ${action.cardStyle}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${action.iconStyle}`}><DashboardActionIcon kind={action.kind} /></span>
        <span aria-hidden="true" className="text-lg opacity-75 transition-transform group-hover:translate-x-1">→</span>
      </span>
      <span className="block min-w-0">
        <span className={`block text-[10px] font-semibold uppercase tracking-[0.16em] ${action.accentStyle}`}>{action.category}</span>
        <span className="mt-1 block break-words text-sm font-bold leading-snug sm:text-base">{action.title}</span>
        <span className={`mt-1 block text-[11px] leading-snug ${action.accentStyle}`}>{action.description}</span>
      </span>
    </Link>
  );
}

function addOneDay(isoDate) {
  const match = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function ScheduleEmptyState({ message }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-3.5 text-left sm:px-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-clinic-700 ring-1 ring-slate-200">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M7 3v4m10-4v4M3 10h18m-13 5 2.5 2.5L16 12" />
        </svg>
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{message}</p>
        <p className="mt-0.5 text-xs text-slate-500">Appointments and treatment follow-ups will appear here when scheduled.</p>
      </div>
    </div>
  );
}

function ScheduleSection({ title, subtitle, items, emptyMessage, showDate = false, framed = true, maxHeightClass, onExpand }) {
  const navigate = useNavigate();

  function openScheduleEntry(event, item) {
    const target = scheduleEntryDestination(item);
    if (target && isDirectScheduleRowClick(event)) {
      navigate(target, { state: DASHBOARD_SCHEDULE_ORIGIN });
    }
  }

  return (
    <section className={framed ? "page-card" : ""}>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <h2 className="section-title min-w-0 flex-1 break-words">{title}</h2>
        {onExpand ? <button type="button" className="button-secondary no-print inline-flex h-11 w-11 shrink-0 items-center justify-center p-0 transition-colors duration-200 hover:border-clinic-700 hover:bg-clinic-700 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clinic-700" onClick={onExpand} aria-label={`Expand ${title}`} title={`Expand ${title}`}><ScheduleSizeIcon /></button> : null}
      </div>
      {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
      <div
        className="mt-4 max-h-[min(55dvh,26rem)] overflow-y-auto overscroll-y-contain pr-1 focus-visible:rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clinic-700 md:hidden"
        role="region"
        aria-label={`${title} patient entries`}
        tabIndex={items.length ? 0 : undefined}
      >
        {items.length
          ? <ScheduleEntriesMobile items={items} emptyMessage={emptyMessage} showDate={showDate} />
          : <ScheduleEmptyState message={emptyMessage} />}
      </div>
      <div
        className={`mt-4 hidden overflow-auto rounded-2xl border border-slate-200 md:block ${
          maxHeightClass || (showDate ? "max-h-[420px]" : "max-h-[320px]")
        }`}
      >
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-slate-600">
            <tr>
              {showDate ? <th className="px-4 py-3">Date</th> : null}
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Patient</th>
              <th className="px-4 py-3">Procedure</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Branch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {items.length ? (
              items.map((item) => (
                <tr key={`${item.source_type}-${item.source_id}-${item.schedule_date}`} onClick={(event) => openScheduleEntry(event, item)} className={`transition-colors duration-200 hover:bg-[#edf5f1] focus-within:bg-[#edf5f1] ${scheduleEntryDestination(item) ? "cursor-pointer" : ""}`}>
                  {showDate ? <td className="px-4 py-3">{formatReadableDate(item.schedule_date)}</td> : null}
                  <td className="px-4 py-3">{displayNoFinalTime(item.appointment_time)}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{scheduleEntryDestination(item) ? <Link to={scheduleEntryDestination(item)} state={DASHBOARD_SCHEDULE_ORIGIN} className="rounded text-clinic-700 underline-offset-4 hover:text-clinic-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-clinic-700">{item.patient_name}</Link> : item.patient_name}</td>
                  <td className="px-4 py-3">{displayPlannedProcedure(item.procedure_label)}</td>
                  <td className="px-4 py-3">{item.source_type === "appointment" ? "Scheduled Appointment" : "Follow-up from Treatment"}</td>
                  <td className="px-4 py-3"><ScheduleStatus value={item.status || (item.source_type === "treatment_follow_up" ? "Scheduled" : "Not specified")} /></td>
                  <td className="px-4 py-3">{item.mobile_number || "-"}</td>
                  <td className="px-4 py-3">{item.branch_location || "-"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-3" colSpan={showDate ? 8 : 7}>
                  <ScheduleEmptyState message={emptyMessage} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BirthdayHighlightCard({ items }) {
  const todayItems = items.filter((item) => item.is_today);
  const upcomingItems = items.filter((item) => !item.is_today);

  if (todayItems.length) {
    const previewItems = todayItems.slice(0, 3);

    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Birthday Today</p>
        {todayItems.length === 1 ? (
          <>
            <p className="mt-2 text-base font-semibold">
              {todayItems[0].patient_name}
              {todayItems[0].age_turning ? ` turns ${todayItems[0].age_turning} today` : " has a birthday today"}
            </p>
            <p className="mt-2 text-sm">Contact: {todayItems[0].mobile_number || "-"}</p>
            <p className="text-sm">Branch: {todayItems[0].branch_location || "-"}</p>
          </>
        ) : (
          <>
            <p className="mt-2 text-base font-semibold">{todayItems.length} patients have birthdays today</p>
            <div className="mt-3 space-y-1 text-sm">
              {previewItems.map((item) => (
                <p key={`${item.patient_id}-${item.birthday_date}`}>{item.patient_name}</p>
              ))}
            </div>
            {todayItems.length > previewItems.length ? <p className="mt-2 text-sm">See Birthday Reminders below for the full list.</p> : null}
          </>
        )}
      </div>
    );
  }

  if (upcomingItems.length) {
    const nextBirthday = upcomingItems[0];

    return (
      <div className="flex items-start gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-orange-900">
        <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-700 sm:flex"><ClinicUiIcon kind="birthday" /></span><div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">Upcoming Birthday</p>
        <p className="mt-2 text-base font-semibold">
          {nextBirthday.patient_name} on {formatReadableDate(nextBirthday.birthday_date)}
        </p>
        <p className="mt-2 text-sm">Turning: {nextBirthday.age_turning || "-"}</p>
        <p className="text-sm">Branch: {nextBirthday.branch_location || "-"}</p>
      </div></div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Birthday Reminders</p>
      <p className="mt-2 text-sm font-medium">No birthday reminders today.</p>
    </div>
  );
}

export default function DashboardPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [saveNotice, setSaveNotice] = useState(null);
  const [dashboardError, setDashboardError] = useState("");
  const [selectedDateError, setSelectedDateError] = useState("");
  const [summary, setSummary] = useState({
    totalPatientRecords: 0,
    latestPatients: [],
    latestTreatments: [],
    todaySchedule: {
      date: "",
      appointmentCount: 0,
      followUpCount: 0
    }
  });
  const [schedule, setSchedule] = useState({
    todaySchedule: {
      date: "",
      appointmentCount: 0,
      followUpCount: 0,
      entries: []
    },
    todayAppointments: [],
    upcomingAppointments: [],
    birthdayReminders: [],
    today: ""
  });
  const [selectedScheduleDate, setSelectedScheduleDate] = useState("");
  const [expandedSchedule, setExpandedSchedule] = useState(null);
  const [expandedItems, setExpandedItems] = useState([]);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [expandedError, setExpandedError] = useState("");
  const [expandedStatusFilter, setExpandedStatusFilter] = useState("All");
  const [selectedDateSchedule, setSelectedDateSchedule] = useState({
    date: "",
    appointments: []
  });

  useEffect(() => {
    getDashboardSummary().then(setSummary).catch(() => setDashboardError("Some dashboard information could not be loaded. Refresh to retry."));
    getDashboardSchedule().then(setSchedule).catch(() => setDashboardError("Some dashboard information could not be loaded. Refresh to retry."));
  }, []);

  useEffect(() => {
    if (!selectedScheduleDate) return undefined;
    let active = true;
    setSelectedDateError("");
    getDashboardScheduleByDate(selectedScheduleDate)
      .then((response) => {
        if (active) setSelectedDateSchedule(response);
      })
      .catch(() => {
        if (active) {
          setSelectedDateSchedule({ date: selectedScheduleDate, appointments: [] });
          setSelectedDateError("Unable to load the selected date. Please try again.");
        }
      });
    return () => { active = false; };
  }, [selectedScheduleDate]);

  useEffect(() => {
    if (!selectedScheduleDate && schedule.today) {
      const defaultDate = addOneDay(schedule.today);
      setSelectedScheduleDate(defaultDate);
      setSelectedDateSchedule((current) => ({ ...current, date: defaultDate }));
    }
  }, [schedule.today, selectedScheduleDate]);

  const dismissSaveNotice = useCallback(() => setSaveNotice(null), []);

  useEffect(() => {
    const payload = location.state?.saveNotice;
    if (!isAppointmentSaveNotice(payload)) return;
    setSaveNotice(appointmentSaveNotice(payload.kind === "appointment-updated" ? "edit" : "create"));
    const { saveNotice: _consumed, ...remainingState } = location.state;
    navigate(location.pathname + location.search, {
      replace: true,
      state: Object.keys(remainingState).length ? remainingState : null
    });
  }, [location.pathname, location.search, location.state, navigate]);

  const closeExpandedSchedule = useCallback(() => setExpandedSchedule(null), []);

  useEffect(() => {
    if (!expandedSchedule) return undefined;
    let active = true;
    setExpandedLoading(true);
    setExpandedItems([]);
    setExpandedError("");
    getDashboardScheduleByDate(expandedSchedule.date, true)
      .then((response) => { if (active) setExpandedItems(response.appointments || []); })
      .catch(() => { if (active) setExpandedError("Unable to load the full schedule. Please close and reopen."); })
      .finally(() => { if (active) setExpandedLoading(false); });
    return () => { active = false; };
  }, [expandedSchedule]);

  function expandSchedule(kind) {
    const date = kind === "today" ? schedule.today : selectedScheduleDate;
    if (!date) return;
    setExpandedStatusFilter("All");
    setExpandedSchedule({ kind, date });
  }

  return (
    <Layout contentClassName="dashboard-wide-shell">
      <AppointmentSavedToast notice={saveNotice} onDismiss={dismissSaveNotice} />
      {dashboardError ? <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{dashboardError}</p> : null}
      {expandedSchedule ? (
        <ExpandedScheduleDialog
          title={expandedSchedule.kind === "today" ? "Today's Clinic Schedule" : "Check Schedule by Date"}
          selectedDate={expandedSchedule.date}
          items={expandedItems}
          loading={expandedLoading}
          error={expandedError}
          statusFilter={expandedStatusFilter}
          onStatusFilter={setExpandedStatusFilter}
          onClose={closeExpandedSchedule}
        />
      ) : null}
      <div className="grid min-w-0 items-stretch gap-4 sm:gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="page-card flex min-w-0 flex-col gap-5 xl:justify-between">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-[0.2em] text-clinic-700 sm:text-sm sm:tracking-[0.3em]">Clinic Workspace</p>
              <h1 className="mt-2 text-xl font-bold leading-tight text-slate-900 sm:text-2xl xl:text-3xl">Clinic Snapshot</h1>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-2xl bg-clinic-50 px-4 py-3 text-right" title="Total patient records"><ClinicUiIcon kind="patients" className="hidden h-6 w-6 text-clinic-700 sm:block" /><div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-clinic-700">Patients</p>
              <p aria-label="Total patient records" className="text-2xl font-bold text-clinic-900">{summary.totalPatientRecords}</p>
            </div></div>
          </div>
          <div className="grid grid-cols-2 items-stretch gap-3 2xl:grid-cols-4 2xl:gap-4">
            {dashboardActions.map((action) => <DashboardActionCard key={action.to} action={action} />)}
          </div>
          <BirthdayHighlightCard items={schedule.birthdayReminders} />
        </section>
        <section className="grid min-w-0 content-start gap-4 sm:gap-6">
          <div className="page-card">
            <h2 className="section-title">Today's Schedule</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
              <div aria-label="Appointment entries in today's clinic schedule" className="rounded-2xl bg-slate-50 p-3 sm:p-4">
                <div className="flex items-start justify-between gap-2"><p className="min-w-0 text-sm text-slate-500">Appointments</p><span className="flex shrink-0 items-center justify-center rounded-xl bg-clinic-100 p-2 text-clinic-700"><ClinicUiIcon kind="calendar" /></span></div>
                <p className="mt-2 text-3xl font-bold text-slate-900">{summary.todaySchedule.appointmentCount}</p>
              </div>
              <div aria-label="Treatment follow-up entries in today's clinic schedule" className="rounded-2xl bg-slate-50 p-3 sm:p-4">
                <div className="flex items-start justify-between gap-2"><p className="min-w-0 text-sm text-slate-500">Follow-ups</p><span className="flex shrink-0 items-center justify-center rounded-xl bg-clinic-100 p-2 text-clinic-700"><ClinicUiIcon kind="followup" /></span></div>
                <p className="mt-2 text-3xl font-bold text-slate-900">{summary.todaySchedule.followUpCount}</p>
              </div>
            </div>
            {Number(summary.todaySchedule.appointmentCount) === 0 && Number(summary.todaySchedule.followUpCount) === 0
              ? <p className="mt-3 text-xs text-slate-500">No appointments or follow-ups scheduled today.</p>
              : null}
          </div>
          <div className="page-card">
            <h2 className="section-title">Recent Patients</h2>
            {summary.latestPatients.length ? (
              <div
                className="mt-3 max-h-[208px] space-y-2 overflow-y-auto overscroll-y-contain pr-1 text-sm sm:max-h-[188px]"
                role="region"
                aria-label="Recent patient records"
                tabIndex={summary.latestPatients.length > 3 ? 0 : undefined}
              >
                {summary.latestPatients.map((patient) => (
                  <Link
                    key={patient.patient_id}
                    to={`/patients/${patient.patient_id}`}
                    aria-label={`Open patient record: ${patient.display_name}, ${patient.patient_id}`}
                    className="flex min-h-[52px] min-w-0 flex-col justify-center gap-0.5 rounded-xl border border-slate-200 px-3 py-2.5 transition-colors hover:border-clinic-500 hover:bg-clinic-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clinic-700 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4"
                  >
                    <span className="min-w-0 font-semibold text-slate-900 sm:truncate sm:text-base" title={patient.display_name}>{patient.display_name}</span>
                    <span className="shrink-0 text-xs text-slate-500 sm:text-sm">{patient.patient_id}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-3 flex min-w-0 items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-3 text-left">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-clinic-700 ring-1 ring-slate-200">
                  <DashboardActionIcon kind="register" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">No patient records yet</p>
                  <p className="mt-0.5 text-xs text-slate-500">Registered patients will appear here.</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="mt-4 grid min-w-0 gap-4 sm:mt-6 sm:gap-6">
        <ScheduleSection
          title={`Today's Clinic Schedule${schedule.today ? ` • ${formatReadableDate(schedule.today)}` : ""}`}
          items={schedule.todayAppointments}
          emptyMessage="No patients scheduled today."
          onExpand={() => expandSchedule("today")}
        />
        <section className="page-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="section-title">Check Schedule by Date</h2>
              <p className="mt-1 text-sm text-slate-600">Use this to check schedules for tomorrow or any future date.</p>
            </div>
            <div className="w-full min-w-0 sm:max-w-xs">
              <label className="label-text" htmlFor="dashboard-schedule-date">
                Select Date
              </label>
              <input
                id="dashboard-schedule-date"
                type="date"
                className="text-input"
                value={selectedScheduleDate}
                onChange={(event) => setSelectedScheduleDate(event.target.value)}
              />
            </div>
          </div>
          <div className="mt-4">
            {selectedDateError ? <p role="alert" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{selectedDateError}</p> : null}
            <ScheduleSection
              title={formatReadableDate(selectedDateSchedule.date || selectedScheduleDate)}
              items={selectedDateSchedule.appointments}
              emptyMessage="No scheduled patients for this date."
              framed={false}
              maxHeightClass="max-h-[320px]"
              onExpand={() => expandSchedule("date")}
            />
          </div>
        </section>
      </div>
    </Layout>
  );
}
