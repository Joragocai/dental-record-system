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

function addOneDay(isoDate) {
  const match = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-title">{title}</h2>
        {onExpand ? <button type="button" className="button-secondary no-print inline-flex h-11 w-11 shrink-0 items-center justify-center p-0 transition-colors duration-200 hover:border-clinic-700 hover:bg-clinic-700 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clinic-700" onClick={onExpand} aria-label={`Expand ${title}`} title={`Expand ${title}`}><ScheduleSizeIcon /></button> : null}
      </div>
      {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
      <div className="mt-4 md:hidden">
        <ScheduleEntriesMobile items={items} emptyMessage={emptyMessage} showDate={showDate} />
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
                  <td className="px-4 py-3">{item.source_type === "treatment_follow_up" ? "Scheduled" : item.status || "-"}</td>
                  <td className="px-4 py-3">{item.mobile_number || "-"}</td>
                  <td className="px-4 py-3">{item.branch_location || "-"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={showDate ? 8 : 7}>
                  {emptyMessage}
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
      <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-orange-900">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">Upcoming Birthday</p>
        <p className="mt-2 text-base font-semibold">
          {nextBirthday.patient_name} on {formatReadableDate(nextBirthday.birthday_date)}
        </p>
        <p className="mt-2 text-sm">Turning: {nextBirthday.age_turning || "-"}</p>
        <p className="text-sm">Branch: {nextBirthday.branch_location || "-"}</p>
      </div>
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
  const [expandedStatusFilter, setExpandedStatusFilter] = useState("Scheduled");
  const [selectedDateSchedule, setSelectedDateSchedule] = useState({
    date: "",
    appointments: []
  });

  useEffect(() => {
    getDashboardSummary().then(setSummary).catch(() => {});
    getDashboardSchedule().then(setSchedule).catch(() => {});
  }, []);

  useEffect(() => {
    getDashboardScheduleByDate(selectedScheduleDate).then(setSelectedDateSchedule).catch(() => {
      setSelectedDateSchedule({ date: selectedScheduleDate, appointments: [] });
    });
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
    setExpandedStatusFilter("Scheduled");
    setExpandedSchedule({ kind, date });
  }

  return (
    <Layout>
      <AppointmentSavedToast notice={saveNotice} onDismiss={dismissSaveNotice} />
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
      <div className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="page-card flex min-w-0 flex-col gap-5 xl:justify-between">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-[0.2em] text-clinic-700 sm:text-sm sm:tracking-[0.3em]">Clinic Overview</p>
              <h1 className="mt-2 text-xl font-bold leading-tight text-slate-900 sm:text-2xl xl:text-3xl">A Unified System for Clinical Data and Record Management</h1>
            </div>
            <div className="shrink-0 rounded-2xl bg-clinic-50 px-4 py-3 text-right" title="Total patient records">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-clinic-700">Patients</p>
              <p aria-label="Total patient records" className="text-2xl font-bold text-clinic-900">{summary.totalPatientRecords}</p>
            </div>
          </div>
          <p className="max-w-2xl text-sm text-slate-600">
            Use patient search to open records, enter treatments under a selected patient, print clean clinic forms, and export data to Excel files stored locally.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <Link
              className="dashboard-action-card col-span-2 min-w-0 rounded-2xl bg-teal-700 p-4 text-white shadow-sm ring-1 ring-teal-900/15 hover:bg-teal-800 sm:col-span-1"
              to="/treatments/new"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-teal-100">Treatment</p>
              <p className="mt-2 break-words text-base font-semibold text-white sm:text-lg">New Treatment</p>
            </Link>
            <Link
              className="dashboard-action-card rounded-2xl bg-slate-900 p-4 text-white shadow-sm ring-1 ring-slate-950/10 hover:bg-slate-800"
              to="/patients"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Find</p>
              <p className="mt-2 break-words text-base font-semibold text-white sm:text-lg">Patient Search</p>
            </Link>
            <Link
              className="dashboard-action-card rounded-2xl bg-clinic-700 p-4 text-white shadow-sm ring-1 ring-clinic-800/10 hover:bg-clinic-800"
              to="/patients/new"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-clinic-100">Create</p>
              <p className="mt-2 break-words text-base font-semibold text-white sm:text-lg">New Patient</p>
            </Link>
          </div>
          <BirthdayHighlightCard items={schedule.birthdayReminders} />
        </section>
        <section className="grid min-w-0 gap-4 sm:gap-6">
          <div className="page-card">
            <h2 className="section-title">Today's Schedule</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
              <div aria-label="Appointment entries in today's clinic schedule" className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Appointments</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{summary.todaySchedule.appointmentCount}</p>
              </div>
              <div aria-label="Treatment follow-up entries in today's clinic schedule" className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Follow-ups</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{summary.todaySchedule.followUpCount}</p>
              </div>
            </div>
          </div>
          <div className="page-card">
            <h2 className="section-title">Recent Patients</h2>
            <div className="mt-4 max-h-[232px] space-y-3 overflow-y-auto pr-1 text-sm">
              {summary.latestPatients.map((patient) => (
                <Link key={patient.patient_id} to={`/patients/${patient.patient_id}`} className="block rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
                  <p className="font-semibold text-slate-900">{patient.display_name}</p>
                  <p className="text-slate-500">{patient.patient_id}</p>
                </Link>
              ))}
              {!summary.latestPatients.length && <p className="text-slate-500">No patients yet.</p>}
            </div>
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
