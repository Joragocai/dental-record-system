import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import BackButton from "../components/BackButton";
import Layout from "../components/Layout";
import { PrintSection } from "../components/PrintableDocument";
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
      <div className="print-document">
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
          <div className="document-sheet">
            <header className="document-header">
              <p className="document-kicker">KHURANA CALILAP DENTAL RECORD SYSTEM</p>
              <div className="document-header-row">
                <div>
                  <h1 className="document-title">Treatment History</h1>
                  <p className="document-name">{patient?.display_name || "Loading patient"}</p>
                </div>
                <div className="document-meta">
                  <span>Patient ID: {patient?.patient_id || patientId}</span>
                  <span>Total Treatments: {treatments.length}</span>
                </div>
              </div>
              <div className={`document-alert ${hasMedicalAlert ? "document-alert-danger" : "document-alert-neutral"}`}>
                <strong>Medical Alert Summary:</strong>{" "}
                <span className="whitespace-normal break-words">{patient?.medical_alert_summary || "No major medical alerts generated yet."}</span>
              </div>
            </header>
            <PrintSection title="Treatment History">
              <TreatmentHistoryTable treatments={treatments} />
            </PrintSection>
          </div>
        </section>
      </div>
    </Layout>
  );
}
