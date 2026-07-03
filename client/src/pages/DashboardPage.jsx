import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import { getDashboardSummary } from "../lib/api";

export default function DashboardPage() {
  const [summary, setSummary] = useState({
    patientCount: 0,
    treatmentCount: 0,
    latestPatients: [],
    latestTreatments: []
  });

  useEffect(() => {
    getDashboardSummary().then(setSummary).catch(() => {});
  }, []);

  return (
    <Layout>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="page-card space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-clinic-700">Clinic Overview</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">Local records, faster than the old workbook.</h1>
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
            <Link className="rounded-2xl bg-clinic-700 p-4 text-white" to="/patients/new">
              <p className="text-xs uppercase tracking-[0.2em] text-clinic-100">Create</p>
              <p className="mt-2 text-lg font-semibold">New Patient</p>
            </Link>
            <Link className="rounded-2xl bg-slate-900 p-4 text-white" to="/patients">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Find</p>
              <p className="mt-2 text-lg font-semibold">Patient Search</p>
            </Link>
            <Link className="rounded-2xl bg-white p-4 ring-1 ring-slate-200" to="/treatments/new">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Record</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">New Treatment</p>
            </Link>
          </div>
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
            <div className="mt-4 space-y-3 text-sm">
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
    </Layout>
  );
}
