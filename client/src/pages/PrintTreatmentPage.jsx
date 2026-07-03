import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Layout from "../components/Layout";
import { getPatient, getTreatment, getTreatmentAttachments, getUploadUrl } from "../lib/api";

function PrintField({ label, value }) {
  return (
    <div className="print-field">
      <strong>{label}:</strong> {value || "-"}
    </div>
  );
}

function PrintSection({ title, children }) {
  return (
    <section className="print-section">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function PrintTreatmentPage() {
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

  if (!treatment) return <Layout><section className="page-card">Loading...</section></Layout>;

  return (
    <Layout>
      <div className="print-document">
        <section className="page-card">
          <div className="mb-6 flex items-center justify-between no-print">
            <h1 className="text-2xl font-bold text-slate-900">Treatment Record Printout</h1>
            <button className="button-primary" onClick={() => window.print()}>
              Print
            </button>
          </div>
          <header className="rounded-2xl border border-slate-300 p-5">
            <h1 className="text-3xl font-bold">Treatment Record</h1>
            <p className="mt-2 text-lg font-medium">{patient?.display_name || treatment.patient_id}</p>
            <p className="mt-1 text-sm">{treatment.treatment_id} | Date {treatment.treatment_date}</p>
          </header>

          <PrintSection title="Patient Details">
            <div className="print-field-grid">
              <PrintField label="Patient ID" value={patient?.patient_id || treatment.patient_id} />
              <PrintField label="Patient Name" value={patient?.display_name} />
              <PrintField label="Date Registered" value={patient?.date_registered} />
              <PrintField label="Birthday" value={patient?.birthday} />
              <PrintField label="Age" value={patient?.age} />
              <PrintField label="Gender" value={patient?.gender} />
              <PrintField label="Mobile Number" value={patient?.mobile_number} />
              <PrintField label="Home Address" value={patient?.home_address} />
              <PrintField label="Medical Alert Summary" value={patient?.medical_alert_summary} />
            </div>
          </PrintSection>

          <PrintSection title="Treatment Details">
            <div className="print-field-grid">
              <PrintField label="Treatment ID" value={treatment.treatment_id} />
              <PrintField label="Treatment Date" value={treatment.treatment_date} />
              <PrintField label="Procedure" value={treatment.procedure} />
              <PrintField label="Dentist/s" value={treatment.dentists} />
              <PrintField label="Tooth No./s" value={treatment.tooth_numbers} />
              <PrintField label="Next Appointment" value={treatment.next_appointment} />
              <PrintField label="Amount Charged" value={Number(treatment.amount_charged || 0).toFixed(2)} />
              <PrintField label="Amount Paid" value={Number(treatment.amount_paid || 0).toFixed(2)} />
              <PrintField label="Balance" value={Number(treatment.balance || 0).toFixed(2)} />
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 p-3 text-sm">
              <strong>Remarks:</strong> {treatment.remarks || "-"}
            </div>
          </PrintSection>

          {attachments.length > 0 && (
            <PrintSection title="Attachment Previews">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="rounded-2xl border border-slate-200 p-3">
                    {attachment.mime_type?.startsWith("image/") ? (
                      <img src={getUploadUrl(attachment.file_path)} alt={attachment.original_filename} className="h-40 w-full rounded-xl object-cover" />
                    ) : (
                      <div className="flex h-40 items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500">File Preview Not Available</div>
                    )}
                    <p className="mt-2 text-sm font-medium">{attachment.original_filename}</p>
                    <p className="text-xs text-slate-500">{attachment.attachment_type}</p>
                  </div>
                ))}
              </div>
            </PrintSection>
          )}
        </section>
      </div>
    </Layout>
  );
}
