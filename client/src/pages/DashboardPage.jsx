import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import { getDashboardSchedule, getDashboardSummary } from "../lib/api";
import { displayNoFinalTime, displayPlannedProcedure, formatReadableDate } from "../lib/formatters";

function ScheduleSection({ title, subtitle, items, emptyMessage, showDate = false }) {
  return (
    <section className="page-card">
      <h2 className="section-title">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
      <div
        className={`mt-4 overflow-auto rounded-2xl border border-slate-200 ${
          showDate ? "max-h-[420px]" : "max-h-[320px]"
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
                <tr key={`${item.source_type}-${item.source_id}-${item.schedule_date}`}>
                  {showDate ? <td className="px-4 py-3">{formatReadableDate(item.schedule_date)}</td> : null}
                  <td className="px-4 py-3">{displayNoFinalTime(item.appointment_time)}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{item.patient_name}</td>
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
  const [summary, setSummary] = useState({
    patientCount: 0,
    treatmentCount: 0,
    latestPatients: [],
    latestTreatments: []
  });
  const [schedule, setSchedule] = useState({
    todayAppointments: [],
    upcomingAppointments: [],
    birthdayReminders: [],
    today: ""
  });

  useEffect(() => {
    getDashboardSummary().then(setSummary).catch(() => {});
    getDashboardSchedule().then(setSchedule).catch(() => {});
  }, []);

  return (
    <Layout>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="page-card space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-clinic-700">Clinic Overview</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">A Unified System for Clinical Data and Record Management</h1>
            </div>
            <div className="rounded-2xl bg-clinic-50 px-4 py-3 text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-clinic-700">Records</p>
              <p className="text-2xl font-bold text-clinic-900">{summary.patientCount}</p>
            </div>
          </div>
          <p className="max-w-2xl text-sm text-slate-600">
            Use patient search to open records, enter treatments under a selected patient, print clean clinic forms, and export data to Excel files stored locally.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <Link
              className="dashboard-action-card rounded-2xl bg-clinic-700 p-4 text-white shadow-sm ring-1 ring-clinic-800/10 hover:bg-clinic-800"
              to="/patients/new"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-clinic-100">Create</p>
              <p className="mt-2 text-lg font-semibold text-white">New Patient</p>
            </Link>
            <Link
              className="dashboard-action-card rounded-2xl bg-slate-900 p-4 text-white shadow-sm ring-1 ring-slate-950/10 hover:bg-slate-800"
              to="/patients"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Find</p>
              <p className="mt-2 text-lg font-semibold text-white">Patient Search</p>
            </Link>
            <Link
              className="dashboard-action-card rounded-2xl bg-teal-700 p-4 text-white shadow-sm ring-1 ring-teal-900/15 hover:bg-teal-800"
              to="/treatments/new"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-teal-100">Treatment</p>
              <p className="mt-2 text-lg font-semibold text-white">New Treatment</p>
            </Link>
          </div>
          <BirthdayHighlightCard items={schedule.birthdayReminders} />
        </section>
        <section className="grid gap-6">
          <div className="page-card">
            <h2 className="section-title">Quick Totals</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Patients</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{summary.patientCount}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Treatments</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{summary.treatmentCount}</p>
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

      <div className="mt-6 grid gap-6">
        <ScheduleSection
          title={`Today's Clinic Schedule${schedule.today ? ` • ${formatReadableDate(schedule.today)}` : ""}`}
          items={schedule.todayAppointments}
          emptyMessage="No patients scheduled today."
        />
        <ScheduleSection
          title="Upcoming Appointments"
          subtitle="All future scheduled appointments"
          items={schedule.upcomingAppointments}
          emptyMessage="No upcoming appointments."
          showDate
        />
      </div>
    </Layout>
  );
}
