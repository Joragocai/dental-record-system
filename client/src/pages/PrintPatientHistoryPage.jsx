import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
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

  return (
    <Layout>
      <section className="page-card">
        <div className="mb-6 flex items-center justify-between no-print">
          <h1 className="text-2xl font-bold text-slate-900">Full Patient Treatment History Printout</h1>
          <button className="button-primary" onClick={() => window.print()}>
            Print
          </button>
        </div>
        <div className="mb-4">
          <h2 className="text-2xl font-bold">Treatment History</h2>
          <p>{patient ? `${patient.display_name} | ${patient.patient_id}` : "Loading patient"}</p>
          {patient?.medical_alert_summary && <p className="mt-2 font-semibold text-rose-700">Medical Alert Summary: {patient.medical_alert_summary}</p>}
        </div>
        <TreatmentHistoryTable treatments={treatments} />
      </section>
    </Layout>
  );
}
