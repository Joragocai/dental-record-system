import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import BackButton from "../components/BackButton";
import Layout from "../components/Layout";
import { PrintSection } from "../components/PrintableDocument";
import TreatmentHistoryTable from "../components/TreatmentHistoryTable";
import { getPatient, getTreatmentsByPatient } from "../lib/api";
import { downloadElementAsPdf } from "../lib/pdf";

export default function PrintPatientHistoryPage() {
  const { patientId } = useParams();
  const [patient, setPatient] = useState(null);
  const [treatments, setTreatments] = useState([]);
  const [loadingRecord, setLoadingRecord] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [status, setStatus] = useState("");
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const printableRef = useRef(null);

  useEffect(() => {
    let active = true;
    setLoadingRecord(true);
    setLoadError("");
    setPatient(null);
    setTreatments([]);
    Promise.all([getPatient(patientId), getTreatmentsByPatient(patientId)])
      .then(([record, history]) => {
        if (!active) return;
        setPatient(record);
        setTreatments(history);
      })
      .catch(() => {
        if (active) setLoadError("Unable to load the complete patient treatment history. Please retry.");
      })
      .finally(() => {
        if (active) setLoadingRecord(false);
      });
    return () => { active = false; };
  }, [patientId, retryCount]);

  useEffect(() => {
    if (!patient) return undefined;

    const previousTitle = document.title;
    document.title = `patient-treatment-history-${patient.patient_id}.pdf`;

    return () => {
      document.title = previousTitle;
    };
  }, [patient]);

  const hasMedicalAlert = Boolean(patient?.medical_alert_summary);

  async function handleDownloadPdf() {
    if (!printableRef.current) return;

    setStatus("");
    setIsDownloadingPdf(true);

    try {
      await downloadElementAsPdf(printableRef.current, `patient-treatment-history-${patient?.patient_id || patientId}.pdf`);
    } catch (error) {
      setStatus(error.message || "Unable to download treatment history PDF.");
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  if (loadingRecord) return <Layout><section className="page-card"><p role="status" className="ui-loading text-sm text-slate-500">Loading treatment history print view...</p></section></Layout>;
  if (loadError || !patient) return <Layout><section className="page-card">
    <p role="alert" className="text-sm text-rose-700">{loadError || "Patient treatment history is unavailable."}</p>
    <button type="button" className="button-secondary mt-3 min-h-11" onClick={() => setRetryCount((count) => count + 1)}>Retry</button>
  </section></Layout>;

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
              <button className="button-secondary" onClick={handleDownloadPdf} disabled={isDownloadingPdf}>
                {isDownloadingPdf ? "Preparing PDF..." : "Download PDF"}
              </button>
            </div>
          </div>
          {status && (
            <div className="feedback-message mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 no-print">
              {status}
            </div>
          )}
          <div ref={printableRef} className="document-sheet" data-print-root="patient-treatment-history">
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
