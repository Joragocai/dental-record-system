import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import TreatmentHistoryTable from "../components/TreatmentHistoryTable";
import { getExportUrl, getPatient, getTreatmentsByPatient } from "../lib/api";

export default function PatientTreatmentHistoryPage() {
  const { patientId } = useParams();
  const [patient, setPatient] = useState(null);
  const [treatments, setTreatments] = useState([]);

  useEffect(() => {
    getPatient(patientId).then(setPatient).catch(() => setPatient(null));
    getTreatmentsByPatient(patientId).then(setTreatments).catch(() => setTreatments([]));
  }, [patientId]);

  return (
    <Layout contentClassName="patient-record-page record-detail-wide-shell">
      <div className="no-print mb-3">
        <Link
          to={`/patients/${patientId}`}
          aria-label="Back to Patient Record"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-clinic-700 transition-colors duration-200 ease-out hover:bg-clinic-50 hover:text-clinic-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clinic-700"
        >
          <span aria-hidden="true">←</span> Patient Record
        </Link>
      </div>

      <section className="page-card">
        <p className="text-sm uppercase tracking-[0.2em] text-clinic-700">Patient Treatment History</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Treatment History</h1>
        <p className="mt-2 text-sm text-slate-600">
          {patient ? `${patient.display_name} | ${patient.patient_id}` : "Loading patient"}
        </p>
        <div className="no-print mt-5 flex flex-wrap items-center gap-2 sm:gap-3">
          <Link className="button-secondary inline-flex min-h-11 items-center justify-center gap-2" to={`/print/patients/${patientId}/treatments`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <path d="M6 15h12v6H6zM18 12h.01" />
            </svg>
            Print Full History
          </Link>
          <a className="button-secondary inline-flex min-h-11 items-center justify-center gap-2" href={getExportUrl(`/api/export/patients/${patientId}/treatments`)}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4" />
            </svg>
            Export Treatments
          </a>
        </div>
      </section>

      <section className="page-card mt-6">
        <h2 className="section-title">Treatment Records</h2>
        <div className="mt-4">
          <TreatmentHistoryTable treatments={treatments} fullPage />
        </div>
      </section>
    </Layout>
  );
}
