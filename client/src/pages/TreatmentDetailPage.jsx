import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import AttachmentGallery from "../components/AttachmentGallery";
import AttachmentUploadForm from "../components/AttachmentUploadForm";
import TreatmentRecordActions from "../components/TreatmentRecordActions";
import RecordSuccessToast from "../components/RecordSuccessToast";
import Layout from "../components/Layout";
import { getPatient, getTreatment, getTreatmentAttachments } from "../lib/api";
import { displayNoFinalTime, formatPesoAmount } from "../lib/formatters";
import { consumeTreatmentSaveNotice } from "../lib/treatmentSaveNotice";
import { DASHBOARD_SCHEDULE_ORIGIN, isDashboardScheduleOrigin } from "../lib/dashboardSchedule";

export default function TreatmentDetailPage() {
  const { treatmentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [saveNotice, setSaveNotice] = useState(null);
  const attachmentsRef = useRef(null);
  const cameFromTreatmentEntry = Boolean(location.state?.fromTreatmentEntry && location.state?.treatmentDraft?.patient?.patient_id);
  const cameFromDashboard = isDashboardScheduleOrigin(location.state);
  const [treatment, setTreatment] = useState(null);
  const [patient, setPatient] = useState(null);
  const [attachments, setAttachments] = useState([]);

  useEffect(() => {
    getTreatment(treatmentId)
      .then(async (data) => {
        setTreatment(data);
        const patientData = await getPatient(data.patient_id);
        setPatient(patientData);
      })
      .catch(() => setTreatment(null));
    getTreatmentAttachments(treatmentId).then(setAttachments).catch(() => setAttachments([]));
  }, [treatmentId]);

  useEffect(() => {
    if (location.state?.focusAttachments && treatment) {
      attachmentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [location.state, treatment]);

  useEffect(() => {
    const consumed = consumeTreatmentSaveNotice(location.state);
    if (!consumed) return;

    setSaveNotice(consumed.notice);
    navigate(location.pathname + location.search + location.hash, {
      replace: true,
      state: consumed.remainingState
    });
  }, [location.pathname, location.search, location.hash, location.state, navigate]);

  const dismissSaveNotice = useCallback(() => setSaveNotice(null), []);

  function refreshAttachments() {
    return getTreatmentAttachments(treatmentId)
      .then(setAttachments)
      .catch((error) => {
        setAttachments([]);
        throw error;
      });
  }

  if (!treatment) {
    return (
      <Layout>
        <section className="page-card">
          <p className="ui-loading text-sm text-slate-500">Loading treatment record...</p>
        </section>
      </Layout>
    );
  }

  return (
    <Layout contentClassName="treatment-record-page record-detail-wide-shell">
      <RecordSuccessToast notice={saveNotice} onDismiss={dismissSaveNotice} dismissLabel="Dismiss treatment notification" />
      <div className="no-print mb-3">
        <Link
          to={cameFromDashboard ? "/" : cameFromTreatmentEntry ? "/treatments/new" : `/patients/${treatment.patient_id}`}
          state={cameFromTreatmentEntry && !cameFromDashboard ? { treatmentDraft: location.state.treatmentDraft } : undefined}
          aria-label={cameFromDashboard ? "Back to Home" : cameFromTreatmentEntry ? "Back to Record Treatment" : "Back to Patient Record"}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-clinic-700 transition-colors duration-200 ease-out hover:bg-clinic-50 hover:text-clinic-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clinic-700"
        >
          <span aria-hidden="true">←</span> {cameFromDashboard ? "Home" : cameFromTreatmentEntry ? "Record Treatment" : "Patient Record"}
        </Link>
      </div>
      <section className="page-card">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-clinic-700">Treatment Record</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">{treatment.procedure}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {treatment.treatment_id} | Date {treatment.treatment_date} | Patient {patient?.display_name || treatment.patient_id}
          </p>
        </div>
        <TreatmentRecordActions treatmentId={treatmentId} patientId={treatment.patient_id} originState={cameFromDashboard ? DASHBOARD_SCHEDULE_ORIGIN : undefined} />
      </section>

      <section className="page-card mt-6">
        <h2 className="section-title">Treatment Details</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <p className="text-sm text-slate-500">Dentist/s</p>
            <p className="font-semibold text-slate-900">{treatment.dentists}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Tooth No./s</p>
            <p className="font-semibold text-slate-900">{treatment.tooth_numbers || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Next Appointment Date</p>
            <p className="font-semibold text-slate-900">{treatment.next_appointment_date || treatment.next_appointment || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Next Appointment Time</p>
            <p className="font-semibold text-slate-900">{treatment.next_appointment_date ? displayNoFinalTime(treatment.next_appointment_time) : "-"}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Amount Charged</p>
            <p className="font-semibold text-slate-900">{formatPesoAmount(treatment.amount_charged)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Discount Type</p>
            <p className="font-semibold text-slate-900">{treatment.discount_type || "None"}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Discount Percent</p>
            <p className="font-semibold text-slate-900">{Number(treatment.discount_percent || 0).toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Discount Amount</p>
            <p className="font-semibold text-slate-900">{formatPesoAmount(treatment.discount_amount)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Net Amount Due</p>
            <p className="font-semibold text-slate-900">{formatPesoAmount(treatment.net_amount_due)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Amount Paid</p>
            <p className="font-semibold text-slate-900">{formatPesoAmount(treatment.amount_paid)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Balance</p>
            <p className="font-semibold text-slate-900">{formatPesoAmount(treatment.balance)}</p>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-sm text-slate-500">Remarks</p>
          <p className="mt-1 whitespace-pre-wrap text-slate-800">{treatment.remarks || "-"}</p>
        </div>
      </section>

      <div className="mt-6">
        <AttachmentUploadForm
          patientId={treatment.patient_id}
          treatmentId={treatmentId}
          onUploaded={refreshAttachments}
          title="Upload Treatment Attachment"
          uploadButtonLabel="Upload Attachment"
          treatmentOnly
        />
      </div>
      <div ref={attachmentsRef} className="mt-6 scroll-mt-8">
        <AttachmentGallery attachments={attachments} title="Treatment Attachments" onDeleted={refreshAttachments} />
      </div>
    </Layout>
  );
}
