import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import BackButton from "../components/BackButton";
import Layout from "../components/Layout";
import { PrintField, PrintableAttachments, PrintSection } from "../components/PrintableDocument";
import { medicalConditionFields } from "../lib/forms";
import { getPatient, getPatientAttachments } from "../lib/api";
import { downloadElementAsPdf } from "../lib/pdf";

export default function PrintPatientPage() {
  const { patientId } = useParams();
  const [patient, setPatient] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [status, setStatus] = useState("");
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const printableRef = useRef(null);

  useEffect(() => {
    getPatient(patientId).then(setPatient).catch(() => setPatient(null));
    getPatientAttachments(patientId).then(setAttachments).catch(() => setAttachments([]));
  }, [patientId]);

  useEffect(() => {
    if (!patient) return undefined;

    const previousTitle = document.title;
    document.title = `patient_${patient.patient_id}_record.pdf`;

    return () => {
      document.title = previousTitle;
    };
  }, [patient]);

  async function handleDownloadPdf() {
    if (!patient) return;

    setStatus("");
    setIsDownloadingPdf(true);

    try {
      await downloadElementAsPdf(printableRef.current, `patient_${patient.patient_id}_record.pdf`);
    } catch (error) {
      setStatus(error.message || "Unable to download patient PDF.");
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  if (!patient) return <Layout><section className="page-card">Loading...</section></Layout>;

  const hasMedicalAlert = Boolean(patient.medical_alert_summary);

  return (
    <Layout>
      <div className="print-document">
        <section className="page-card">
          <div className="mb-6 flex items-center justify-between no-print">
            <h1 className="text-2xl font-bold text-slate-900">Patient Record Printout</h1>
            <div className="flex flex-wrap gap-3">
              <BackButton fallbackTo={`/patients/${patientId}`} />
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
          <div ref={printableRef} className="document-sheet" data-print-root="patient-record">
          <header className="document-header">
            <p className="document-kicker">Electronic Dental Record System</p>
            <div className="document-header-row">
              <div>
                <h1 className="document-title">Patient Record</h1>
                <p className="document-name">{patient.display_name}</p>
              </div>
              <div className="document-meta">
                <span>Patient ID: {patient.patient_id}</span>
                <span>Date Registered: {patient.date_registered}</span>
                <span>Mobile Number: {patient.mobile_number || "-"}</span>
              </div>
            </div>
            <div
              className={`document-alert ${
                hasMedicalAlert ? "document-alert-danger" : "document-alert-neutral"
              }`}
            >
              <strong>Medical Alert Summary:</strong> <span>{patient.medical_alert_summary || "No major medical alerts generated yet."}</span>
            </div>
          </header>

          <PrintSection title="Basic Information">
            <div className="document-grid document-grid-3">
              <PrintField label="Patient ID" value={patient.patient_id} />
              <PrintField label="Date Registered" value={patient.date_registered} />
              <PrintField label="Last Name" value={patient.last_name} />
              <PrintField label="First Name" value={patient.first_name} />
              <PrintField label="Middle Name" value={patient.middle_name} />
              <PrintField label="Birthday" value={patient.birthday} />
              <PrintField label="Age" value={patient.age} />
              <PrintField label="Gender" value={patient.gender} />
              <PrintField label="Religion" value={patient.religion} />
              <PrintField label="Nationality" value={patient.nationality} />
              <PrintField label="Nickname" value={patient.nickname} />
              <PrintField label="Patient Occupation" value={patient.patient_occupation} />
              <PrintField label="Dental Insurance" value={patient.dental_insurance} />
              <PrintField label="Insurance Effective Date" value={patient.insurance_effective_date} />
              <PrintField label="Previous Dentist" value={patient.previous_dentist} />
              <PrintField label="Last Dental Visit" value={patient.last_dental_visit} />
              <PrintField label="Cellphone/Mobile Number" value={patient.mobile_number} />
              <PrintField label="Email Address" value={patient.email_address} />
              <PrintField label="Home Address" value={patient.home_address} />
              <PrintField label="Home Number" value={patient.home_number} />
              <PrintField label="Office Number" value={patient.office_number} />
              <PrintField label="Fax Number" value={patient.fax_number} />
              <PrintField label="Is Minor?" value={patient.is_minor} />
              <PrintField label="Parent/Guardian Name" value={patient.parent_guardian_name} />
              <PrintField label="Parent/Guardian Occupation" value={patient.parent_guardian_occupation} />
              <PrintField label="Referral Source" value={patient.referral_source} />
              <PrintField label="Reason for Dental Consultation" value={patient.reason_for_consultation} />
            </div>
          </PrintSection>

          <PrintSection title="Medical History">
            <div className="document-grid document-grid-3">
              <PrintField label="Are you in good health?" value={patient.good_health} />
              <PrintField label="Under medical treatment now?" value={patient.under_medical_treatment} />
              <PrintField label="Medical Treatment Details" value={patient.medical_treatment_details} />
              <PrintField label="Serious illness or surgical operation?" value={patient.serious_illness_history} />
              <PrintField label="Serious Illness / Operation Details" value={patient.serious_illness_details} />
              <PrintField label="Have you ever been hospitalized?" value={patient.hospitalized_history} />
              <PrintField label="Hospitalization Details" value={patient.hospitalization_details} />
              <PrintField label="Taking medication?" value={patient.taking_medications} />
              <PrintField label="Medication Details" value={patient.medication_details} />
              <PrintField label="Use tobacco products?" value={patient.uses_tobacco} />
              <PrintField label="Use alcohol, cocaine, or dangerous drugs?" value={patient.uses_alcohol_or_drugs} />
              <PrintField label="Pregnant?" value={patient.pregnant} />
              <PrintField label="Nursing?" value={patient.nursing} />
              <PrintField label="Taking birth control pills?" value={patient.birth_control_pills} />
              <PrintField label="Physician Name" value={patient.physician_name} />
              <PrintField label="Physician Specialty" value={patient.physician_specialty} />
              <PrintField label="Physician Office Number" value={patient.physician_office_number} />
              <PrintField label="Physician Office Address" value={patient.physician_office_address} />
            </div>
          </PrintSection>

          <PrintSection title="Allergies and Medical Risk">
            <div className="document-grid document-grid-3">
              <PrintField label="Allergic to any listed items?" value={patient.allergic_to_items} />
              <PrintField label="Blood Type" value={patient.blood_type} />
              <PrintField label="Blood Pressure" value={patient.blood_pressure} />
              <PrintField label="Allergy - Local Anesthetic" value={patient.allergy_local_anesthetic} />
              <PrintField label="Local Anesthetic Details" value={patient.local_anesthetic_details} />
              <PrintField label="Allergy - Penicillin / Antibiotics" value={patient.allergy_penicillin} />
              <PrintField label="Allergy - Sulfa Drugs" value={patient.allergy_sulfa} />
              <PrintField label="Allergy - Aspirin" value={patient.allergy_aspirin} />
              <PrintField label="Allergy - Latex" value={patient.allergy_latex} />
              <PrintField label="Allergy - Others" value={patient.allergy_others} />
              <PrintField label="Allergy Others Details" value={patient.allergy_others_details} />
              <PrintField label="Other Medical Condition" value={patient.other_medical_condition} />
              <PrintField label="Other Medical Condition Details" value={patient.other_medical_condition_details} />
            </div>
          </PrintSection>

          <PrintSection title="Medical Condition Checklist">
            <div className="document-checklist">
              {medicalConditionFields.map(([fieldName, label]) => (
                <div key={fieldName} className="document-check-item">
                  <strong>{patient[fieldName] ? "[X]" : "[ ]"}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </PrintSection>
          <PrintableAttachments attachments={attachments} />
          </div>
        </section>
      </div>
    </Layout>
  );
}
