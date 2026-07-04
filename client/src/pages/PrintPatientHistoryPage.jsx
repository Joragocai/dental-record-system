import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import BackButton from "../components/BackButton";
import Layout from "../components/Layout";
import TreatmentHistoryTable from "../components/TreatmentHistoryTable";
import { getPatient, getTreatmentsByPatient } from "../lib/api";

export default function PrintPatientHistoryPage() {
  const { patientId } = useParams();
  const [patient, setPatient] = useState(null);
  const [treatments, setTreatments] = useState([]);

  useEffect(() => {
    getPatient(patientId).then(setPatient).catch(() => setPatient(null));
    getTreatmentsByPatient(patientId).then(setTreatments).catch(() => setTreatments([]));
  }, [patientId]);

  const hasMedicalAlert = Boolean(patient?.medical_alert_summary);

  return (
    <Layout>
      <section className="page-card">
        <div className="mb-6 flex items-center justify-between no-print">
          <h1 className="text-2xl font-bold text-slate-900">Full Patient Treatment History Printout</h1>
          <div className="flex flex-wrap gap-3">
            <BackButton fallbackTo={`/patients/${patientId}/treatments`} />
            <button className="button-primary" onClick={() => window.print()}>
              Print
            </button>
          </div>
        </div>
        <div className="mb-4">
          <h2 className="text-2xl font-bold">Treatment History</h2>
          <p>{patient ? `${patient.display_name} | ${patient.patient_id}` : "Loading patient"}</p>
          <div className={`mt-3 rounded-xl px-4 py-3 text-sm ${hasMedicalAlert ? "bg-rose-50 font-semibold text-rose-700" : "bg-slate-50 text-slate-600"}`}>
            <strong>Medical Alert Summary:</strong> <span className="whitespace-normal break-words">{patient?.medical_alert_summary || "No major medical alerts generated yet."}</span>
          </div>
        </div>
        <TreatmentHistoryTable treatments={treatments} />
      </section>
    </Layout>
  );
}
