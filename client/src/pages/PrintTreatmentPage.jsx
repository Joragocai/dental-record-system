import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import BackButton from "../components/BackButton";
import Layout from "../components/Layout";
import { getPatient, getTreatment, getTreatmentAttachments, getUploadUrl } from "../lib/api";
import { formatAttachmentType, formatUploadedAt } from "../lib/attachments";
import { formatPesoAmount } from "../lib/formatters";
import { downloadElementAsPdf } from "../lib/pdf";

function PrintField({ label, value }) {
  return (
    <div className="document-field">
      <span className="document-field-label">{label}</span>
      <span className="document-field-value">{value || "-"}</span>
    </div>
  );
}

function PrintSection({ title, children }) {
  return (
    <section className="document-section">
      <h2 className="document-section-title">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function PrintTreatmentPage() {
  const { treatmentId } = useParams();
  const [treatment, setTreatment] = useState(null);
  const [patient, setPatient] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [status, setStatus] = useState("");
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const printableRef = useRef(null);

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
    if (!treatment) return undefined;

    const previousTitle = document.title;
    document.title = `treatment_${treatment.treatment_id}_record.pdf`;

    return () => {
      document.title = previousTitle;
    };
  }, [treatment]);

  async function handleDownloadPdf() {
    if (!treatment) return;

    setStatus("");
    setIsDownloadingPdf(true);

    try {
      await downloadElementAsPdf(printableRef.current, `treatment_${treatment.treatment_id}_record.pdf`);
    } catch (error) {
      setStatus(error.message || "Unable to download treatment PDF.");
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  if (!treatment) return <Layout><section className="page-card">Loading...</section></Layout>;

  return (
    <Layout>
      <div className="print-document">
        <section className="page-card">
          <div className="mb-6 flex items-center justify-between no-print">
            <h1 className="text-2xl font-bold text-slate-900">Treatment Record Printout</h1>
            <div className="flex flex-wrap gap-3">
              <BackButton fallbackTo={patient ? `/patients/${patient.patient_id}` : "/patients"} />
              <button className="button-primary" onClick={() => window.print()}>
                Print
              </button>
              <button className="button-secondary" onClick={handleDownloadPdf} disabled={isDownloadingPdf}>
                {isDownloadingPdf ? "Preparing PDF..." : "Download PDF"}
              </button>
            </div>
          </div>
          {status && (
            <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 no-print">
              {status}
            </div>
          )}
          <div ref={printableRef} className="document-sheet">
          <header className="document-header">
            <p className="document-kicker">Electronic Dental Record System</p>
            <div className="document-header-row">
              <div>
                <h1 className="document-title">Treatment Record</h1>
                <p className="document-name">{patient?.display_name || treatment.patient_id}</p>
              </div>
              <div className="document-meta">
                <span>Treatment ID: {treatment.treatment_id}</span>
                <span>Treatment Date: {treatment.treatment_date}</span>
                <span>Patient ID: {patient?.patient_id || treatment.patient_id}</span>
              </div>
            </div>
          </header>

          <PrintSection title="Patient Details">
            <div className="document-grid document-grid-3">
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
            <div className="document-grid document-grid-3">
              <PrintField label="Treatment ID" value={treatment.treatment_id} />
              <PrintField label="Treatment Date" value={treatment.treatment_date} />
              <PrintField label="Procedure" value={treatment.procedure} />
              <PrintField label="Dentist/s" value={treatment.dentists} />
              <PrintField label="Tooth No./s" value={treatment.tooth_numbers} />
              <PrintField label="Next Appointment" value={treatment.next_appointment} />
              <PrintField label="Amount Charged" value={formatPesoAmount(treatment.amount_charged)} />
              <PrintField label="Amount Paid" value={formatPesoAmount(treatment.amount_paid)} />
              <PrintField label="Balance" value={formatPesoAmount(treatment.balance)} />
            </div>
            <div className="document-remarks">
              <strong>Remarks:</strong> {treatment.remarks || "-"}
            </div>
          </PrintSection>

          {attachments.length > 0 && (
            <PrintSection title="Attachment Previews">
              <div className="attachment-sheet-grid">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="attachment-sheet-item">
                    {attachment.mime_type?.startsWith("image/") ? (
                      <img src={getUploadUrl(attachment.file_path)} alt={attachment.original_filename} className="attachment-sheet-image" />
                    ) : (
                      <div className="attachment-sheet-placeholder">File Preview Not Available</div>
                    )}
                    <p className="mt-2 text-sm font-semibold text-slate-900">{formatAttachmentType(attachment.attachment_type)}</p>
                    <p className="text-xs text-slate-600">Uploaded: {formatUploadedAt(attachment.uploaded_at)}</p>
                    <p className="text-xs text-slate-500">{attachment.original_filename}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-1.5 text-sm">
                {attachments.map((attachment) => (
                  <div key={`list-${attachment.id}`} className="document-attachment-line">
                    <strong>Attachment Category:</strong> {formatAttachmentType(attachment.attachment_type)} | {attachment.original_filename} | Uploaded {formatUploadedAt(attachment.uploaded_at)}
                  </div>
                ))}
              </div>
            </PrintSection>
          )}
          </div>
        </section>
      </div>
    </Layout>
  );
}
