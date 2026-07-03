import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AttachmentGallery from "../components/AttachmentGallery";
import AttachmentUploadForm from "../components/AttachmentUploadForm";
import Layout from "../components/Layout";
import TreatmentHistoryTable from "../components/TreatmentHistoryTable";
import {
  getExportUrl,
  getPatient,
  getPatientAttachments,
  getTreatmentsByPatient
} from "../lib/api";

export default function PatientDetailPage() {
  const { patientId } = useParams();
  const [patient, setPatient] = useState(null);
  const [treatments, setTreatments] = useState([]);
  const [attachments, setAttachments] = useState([]);

  useEffect(() => {
    getPatient(patientId).then(setPatient).catch(() => setPatient(null));
    getTreatmentsByPatient(patientId).then(setTreatments).catch(() => setTreatments([]));
    getPatientAttachments(patientId).then(setAttachments).catch(() => setAttachments([]));
  }, [patientId]);

  function refreshAttachments() {
    getPatientAttachments(patientId).then(setAttachments).catch(() => setAttachments([]));
  }

  if (!patient) {
    return (
      <Layout>
        <section className="page-card">
          <p className="text-sm text-slate-500">Loading patient record...</p>
        </section>
      </Layout>
    );
  }

  return (
    <Layout>
      <section className="page-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-clinic-700">Patient Record</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">{patient.display_name}</h1>
            <p className="mt-2 text-sm text-slate-600">
              {patient.patient_id} | Registered {patient.date_registered} | Mobile {patient.mobile_number || "-"}
            </p>
            {patient.medical_alert_summary && (
              <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                Medical Alert Summary: {patient.medical_alert_summary}
              </p>
            )}
          </div>
          <div className="no-print flex flex-wrap gap-3">
            <Link to={`/patients/${patientId}/edit`} className="button-primary">
              Edit Patient
            </Link>
            <Link to={`/treatments/new?patientId=${patientId}`} className="button-secondary">
              Add Treatment
            </Link>
            <Link to={`/print/patients/${patientId}`} className="button-secondary">
              Print Patient Record
            </Link>
            <a className="button-secondary" href={getExportUrl(`/api/export/patients/${patientId}/full-record`)}>
              Export Full Record
            </a>
          </div>
        </div>
      </section>

      <section className="page-card mt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="section-title">Treatment History</h2>
          <div className="no-print flex gap-3">
            <Link className="button-secondary" to={`/patients/${patientId}/treatments`}>
              Full History Page
            </Link>
            <a className="button-secondary" href={getExportUrl(`/api/export/patients/${patientId}/treatments`)}>
              Export Treatments
            </a>
          </div>
        </div>
        <TreatmentHistoryTable treatments={treatments} />
      </section>

      <div className="mt-6">
        <AttachmentUploadForm patientId={patientId} onUploaded={refreshAttachments} />
      </div>
      <div className="mt-6">
        <AttachmentGallery attachments={attachments} title="Patient Attachments" />
      </div>
    </Layout>
  );
}
