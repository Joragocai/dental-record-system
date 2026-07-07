import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AttachmentGallery from "../components/AttachmentGallery";
import AttachmentUploadForm from "../components/AttachmentUploadForm";
import BackButton from "../components/BackButton";
import Layout from "../components/Layout";
import PatientAppointmentsTable from "../components/PatientAppointmentsTable";
import TreatmentHistoryTable from "../components/TreatmentHistoryTable";
import { displayNone, isPwdRelatedClassification } from "../lib/formatters";
import {
  getExportUrl,
  getPatient,
  getPatientAppointments,
  getPatientAttachments,
  getTreatmentsByPatient,
  updateAppointmentStatus
} from "../lib/api";

export default function PatientDetailPage() {
  const { patientId } = useParams();
  const [patient, setPatient] = useState(null);
  const [treatments, setTreatments] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [updatingAppointmentId, setUpdatingAppointmentId] = useState(null);

  useEffect(() => {
    getPatient(patientId).then(setPatient).catch(() => setPatient(null));
    getTreatmentsByPatient(patientId).then(setTreatments).catch(() => setTreatments([]));
    getPatientAttachments(patientId).then(setAttachments).catch(() => setAttachments([]));
    getPatientAppointments(patientId).then(setAppointments).catch(() => setAppointments([]));
  }, [patientId]);

  function refreshAttachments() {
    return getPatientAttachments(patientId)
      .then(setAttachments)
      .catch((error) => {
        setAttachments([]);
        throw error;
      });
  }

  async function handleAppointmentStatusChange(appointment, status) {
    setUpdatingAppointmentId(appointment.id);
    try {
      const updated = await updateAppointmentStatus(appointment.id, status);
      setAppointments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } finally {
      setUpdatingAppointmentId(null);
    }
  }

  if (!patient) {
    return (
      <Layout>
        <section className="page-card">
          <p className="ui-loading text-sm text-slate-500">Loading patient record...</p>
        </section>
      </Layout>
    );
  }

  const hasMedicalAlert = Boolean(patient.medical_alert_summary);

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
            <p className="mt-1 text-sm text-slate-600">
              Branch: {displayNone(patient.branch_location)} | Patient Classification: {displayNone(patient.discount_eligibility)}
            </p>
            {isPwdRelatedClassification(patient.discount_eligibility) && (
              <p className="mt-1 text-sm text-slate-600">
                Type of Disability: {displayNone(patient.disability_type)}
              </p>
            )}
          </div>
          <div className="no-print flex flex-wrap gap-3">
            <BackButton fallbackTo="/patients" />
            <Link to={`/patients/${patientId}/edit`} className="button-secondary">
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
        <div
          className={`mt-5 rounded-2xl px-4 py-4 ${
            hasMedicalAlert ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-slate-200 bg-slate-50 text-slate-600"
          }`}
        >
          <p className={`text-xs uppercase tracking-[0.2em] ${hasMedicalAlert ? "text-rose-700" : "text-slate-500"}`}>
            Medical Alert Summary
          </p>
          <p className="mt-2 whitespace-normal break-words text-sm leading-relaxed">
            {patient.medical_alert_summary || "No major medical alerts generated yet."}
          </p>
        </div>
      </section>

      <section className="page-card mt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="section-title">Appointments</h2>
          <Link className="button-secondary no-print" to={`/patients/${patientId}/appointments/new`}>
            Schedule Appointment
          </Link>
        </div>
        <PatientAppointmentsTable
          patientId={patientId}
          appointments={appointments}
          onStatusChange={handleAppointmentStatusChange}
          isUpdatingId={updatingAppointmentId}
        />
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
        <AttachmentUploadForm patientId={patientId} onUploaded={refreshAttachments} title="Upload Patient Attachment" />
      </div>
      <div className="mt-6">
        <AttachmentGallery attachments={attachments} title="Patient Attachments" onDeleted={refreshAttachments} />
      </div>
    </Layout>
  );
}
