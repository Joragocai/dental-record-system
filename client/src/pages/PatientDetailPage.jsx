import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import AttachmentGallery from "../components/AttachmentGallery";
import AttachmentUploadForm from "../components/AttachmentUploadForm";
import PatientRecordActions from "../components/PatientRecordActions";
import Layout from "../components/Layout";
import PatientAppointmentsTable from "../components/PatientAppointmentsTable";
import PatientAppointmentCards from "../components/PatientAppointmentCards";
import PatientTreatmentCards from "../components/PatientTreatmentCards";
import AppointmentStatusConfirmDialog from "../components/AppointmentStatusConfirmDialog";
import RecordSuccessToast from "../components/RecordSuccessToast";
import { appointmentSaveNotice, isAppointmentSaveNotice } from "../lib/appointmentSaveNotice";
import { isPatientUpdatedNotice, patientUpdatedNotice } from "../lib/patientSaveNotice";
import { proposeAppointmentStatusChange } from "../lib/appointmentStatusChange";
import TreatmentHistoryTable from "../components/TreatmentHistoryTable";
import { displayNone, isPwdRelatedClassification, formatPesoAmount } from "../lib/formatters";
import {
  getExportUrl,
  getPatient,
  getPatientFinancialSummary,
  getPatientAppointments,
  getPatientAttachments,
  getTreatmentsByPatient,
  updateAppointmentStatus
} from "../lib/api";

export default function PatientDetailPage() {
  const { patientId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [saveNotice, setSaveNotice] = useState(null);
  const [patient, setPatient] = useState(null);
  const [treatments, setTreatments] = useState([]);
  const [financial, setFinancial] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [updatingAppointmentId, setUpdatingAppointmentId] = useState(null);
  const [pendingStatusChange, setPendingStatusChange] = useState(null);
  const [statusChangeError, setStatusChangeError] = useState("");
  const [statusChangeSuccess, setStatusChangeSuccess] = useState("");

  useEffect(() => {
    getPatient(patientId).then(setPatient).catch(() => setPatient(null));
    getPatientFinancialSummary(patientId).then(setFinancial).catch(() => setFinancial(null));
    getTreatmentsByPatient(patientId).then(setTreatments).catch(() => setTreatments([]));
    getPatientAttachments(patientId).then(setAttachments).catch(() => setAttachments([]));
    getPatientAppointments(patientId).then(setAppointments).catch(() => setAppointments([]));
  }, [patientId]);

  useEffect(() => {
    const payload = location.state?.saveNotice;
    if (!isAppointmentSaveNotice(payload) && !isPatientUpdatedNotice(payload)) return;
    setSaveNotice(isPatientUpdatedNotice(payload)
      ? patientUpdatedNotice()
      : appointmentSaveNotice(payload.kind === "appointment-updated" ? "edit" : "create"));
    const { saveNotice: ignored, ...remainingState } = location.state;
    navigate(location.pathname + location.search, { replace: true, state: remainingState });
  }, [location.pathname, location.search, location.state, navigate]);

  const dismissSaveNotice = useCallback(() => setSaveNotice(null), []);

  function refreshAttachments() {
    return getPatientAttachments(patientId)
      .then(setAttachments)
      .catch((error) => {
        setAttachments([]);
        throw error;
      });
  }

  function handleAppointmentStatusChange(appointment, status) {
    if (pendingStatusChange || updatingAppointmentId !== null) return;
    const change = proposeAppointmentStatusChange(appointment, status);
    if (!change) return;
    setStatusChangeSuccess("");
    setStatusChangeError("");
    setPendingStatusChange(change);
  }

  function cancelStatusChange() {
    if (updatingAppointmentId !== null) return;
    setPendingStatusChange(null);
    setStatusChangeError("");
  }

  async function confirmStatusChange() {
    if (!pendingStatusChange || updatingAppointmentId !== null) return;
    const change = pendingStatusChange;
    setUpdatingAppointmentId(change.appointmentId);
    setStatusChangeError("");
    try {
      const updated = await updateAppointmentStatus(change.appointmentId, change.nextStatus);
      setAppointments((current) => current.map((item) => (String(item.id) === String(updated.id) ? updated : item)));
      setPendingStatusChange(null);
      setStatusChangeSuccess(`Appointment status updated to ${updated.status}.`);
    } catch (error) {
      setStatusChangeError(error.response?.data?.message || "Unable to update appointment status. Please retry or cancel.");
    } finally {
      setUpdatingAppointmentId(null);
    }
  }

  if (!patient) {
    return (
      <Layout contentClassName="patient-record-page patient-record-wide-shell">
        <section className="page-card">
          <p className="ui-loading text-sm text-slate-500">Loading patient record...</p>
        </section>
      </Layout>
    );
  }

  const hasMedicalAlert = Boolean(patient.medical_alert_summary);

  return (
    <Layout contentClassName="patient-record-page patient-record-wide-shell">
      <RecordSuccessToast notice={saveNotice} onDismiss={dismissSaveNotice} dismissLabel="Dismiss record notification" />
      <div className="no-print mb-3">
        <Link to="/patients" aria-label="Back to Patient Search" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-clinic-700 transition-colors duration-200 ease-out hover:bg-clinic-50 hover:text-clinic-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clinic-700">
          <span aria-hidden="true">←</span> Patient Search
        </Link>
      </div>
      <section className="page-card">
        <div>
            <p className="text-sm uppercase tracking-[0.2em] text-clinic-700">Patient Record</p>
            <h1 className="mt-2 break-words text-2xl font-bold text-slate-900 [overflow-wrap:anywhere] sm:text-3xl">{patient.display_name}</h1>
            <p className="mt-2 break-words text-sm text-slate-600 [overflow-wrap:anywhere]">
              {patient.patient_id} | Registered {patient.date_registered} | Mobile {patient.mobile_number || "-"}
            </p>
            <p className="mt-1 break-words text-sm text-slate-600 [overflow-wrap:anywhere]">
              Branch: {displayNone(patient.branch_location)} | Patient Classification: {displayNone(patient.discount_eligibility)}
            </p>
            {isPwdRelatedClassification(patient.discount_eligibility) && (
              <p className="mt-1 text-sm text-slate-600">
                Type of Disability: {displayNone(patient.disability_type)}
              </p>
            )}
        </div>
        <PatientRecordActions patientId={patientId} />
        <div
          className={`mt-5 rounded-2xl px-4 py-4 ${
            hasMedicalAlert ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-slate-200 bg-slate-50 text-slate-600"
          }`}
        >
          <p className={`text-xs uppercase tracking-[0.2em] ${hasMedicalAlert ? "text-rose-700" : "text-slate-500"}`}>
            Medical Alert Summary
          </p>
          <p className="mt-2 whitespace-normal break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
            {patient.medical_alert_summary || "No major medical alerts generated yet."}
          </p>
        </div>
      </section>

      <section className="page-card mt-6 min-w-0" id="patient-financial-summary">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="section-title">Patient Financial Summary</h2><Link className="button-secondary" to={`/balances?patientId=${encodeURIComponent(patientId)}`} state={{ backTo: { pathname: location.pathname, search: location.search, hash: "#patient-financial-summary" } }}>View Balances</Link></div>
        {financial ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[["Net Due", financial.net_due], ["Total Paid", financial.total_paid], ["Outstanding", financial.outstanding], ["Treatments with Balance", financial.open_treatments]].map(([title, value]) => <div key={title} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{title}</p><p className="mt-2 text-lg font-bold text-clinic-900">{title === "Treatments with Balance" ? value : formatPesoAmount(value)}</p></div>)}</div> : <p className="text-sm text-slate-500">Financial summary unavailable.</p>}
        <a href="#patient-treatment-history" className="mt-3 inline-flex text-sm font-semibold text-clinic-800 underline">View treatment breakdown</a>
      </section>
      <section className="page-card mt-6 min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">Appointments</h2>
          <Link className="button-secondary no-print inline-flex min-h-11 w-full items-center justify-center gap-2 transition-colors duration-200 sm:w-auto" to={`/patients/${patientId}/appointments/new`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M7 3v4M17 3v4M3 10h18M12 13v5M9.5 15.5h5" />
            </svg>
            <span>Schedule Appointment</span>
          </Link>
        </div>
        {statusChangeSuccess ? <p role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{statusChangeSuccess}</p> : null}
        {appointments.length ? <PatientAppointmentCards patientId={patientId} appointments={appointments} onStatusChange={handleAppointmentStatusChange} isUpdatingId={updatingAppointmentId} statusChangePending={Boolean(pendingStatusChange)} /> : null}
        <div className={appointments.length ? "hidden md:block" : ""}>
        <PatientAppointmentsTable
          patientId={patientId}
          appointments={appointments}
          onStatusChange={handleAppointmentStatusChange}
          isUpdatingId={updatingAppointmentId}
          statusChangePending={Boolean(pendingStatusChange)}
        />
        </div>
        {pendingStatusChange ? (
          <AppointmentStatusConfirmDialog change={pendingStatusChange} saving={updatingAppointmentId !== null} error={statusChangeError} onCancel={cancelStatusChange} onConfirm={confirmStatusChange} />
        ) : null}
      </section>

      <section className="page-card mt-6 min-w-0" id="patient-treatment-history">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">Treatment History</h2>
          <div className="no-print flex w-full flex-wrap gap-2 sm:w-auto sm:gap-3">
            <Link className="button-secondary" to={`/patients/${patientId}/treatments`}>
              Full History Page
            </Link>
            <a className="button-secondary" href={getExportUrl(`/api/export/patients/${patientId}/treatments`)}>
              Export Treatments
            </a>
          </div>
        </div>
        <div className="md:hidden"><PatientTreatmentCards treatments={treatments} /></div>
        <div className="hidden min-w-0 md:block"><TreatmentHistoryTable treatments={treatments} /></div>
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
