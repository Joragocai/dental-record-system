import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AttachmentGallery from "../components/AttachmentGallery";
import AttachmentUploadForm from "../components/AttachmentUploadForm";
import Layout from "../components/Layout";
import { getExportUrl, getPatient, getTreatment, getTreatmentAttachments } from "../lib/api";

export default function TreatmentDetailPage() {
  const { treatmentId } = useParams();
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

  function refreshAttachments() {
    getTreatmentAttachments(treatmentId).then(setAttachments).catch(() => setAttachments([]));
  }

  if (!treatment) {
    return (
      <Layout>
        <section className="page-card">
          <p className="text-sm text-slate-500">Loading treatment record...</p>
        </section>
      </Layout>
    );
  }

  return (
    <Layout>
      <section className="page-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-clinic-700">Treatment Record</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">{treatment.procedure}</h1>
            <p className="mt-2 text-sm text-slate-600">
              {treatment.treatment_id} | Date {treatment.treatment_date} | Patient {patient?.display_name || treatment.patient_id}
            </p>
          </div>
          <div className="no-print flex flex-wrap gap-3">
            <Link to={`/treatments/${treatmentId}/edit`} className="button-primary">
              Edit Treatment
            </Link>
            <Link to={`/print/treatments/${treatmentId}`} className="button-secondary">
              Print Treatment
            </Link>
            {patient && (
              <a className="button-secondary" href={getExportUrl(`/api/export/patients/${patient.patient_id}/treatments`)}>
                Export Patient Treatments
              </a>
            )}
          </div>
        </div>
      </section>

      <section className="page-card mt-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <p className="text-sm text-slate-500">Dentist/s</p>
            <p className="font-semibold text-slate-900">{treatment.dentists}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Tooth No./s</p>
            <p className="font-semibold text-slate-900">{treatment.tooth_numbers || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Next Appointment</p>
            <p className="font-semibold text-slate-900">{treatment.next_appointment || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Amount Charged</p>
            <p className="font-semibold text-slate-900">{treatment.amount_charged}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Amount Paid</p>
            <p className="font-semibold text-slate-900">{treatment.amount_paid}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Balance</p>
            <p className="font-semibold text-slate-900">{treatment.balance}</p>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-sm text-slate-500">Remarks</p>
          <p className="mt-1 whitespace-pre-wrap text-slate-800">{treatment.remarks || "-"}</p>
        </div>
      </section>

      <div className="mt-6">
        <AttachmentUploadForm patientId={treatment.patient_id} treatmentId={treatmentId} onUploaded={refreshAttachments} />
      </div>
      <div className="mt-6">
        <AttachmentGallery attachments={attachments} title="Treatment Attachments" />
      </div>
    </Layout>
  );
}
