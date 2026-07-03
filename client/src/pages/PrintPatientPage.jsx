import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Layout from "../components/Layout";
import { medicalConditionFields } from "../lib/forms";
import { getPatient, getPatientAttachments, getUploadUrl } from "../lib/api";

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

function PrintableAttachments({ attachments }) {
  if (!attachments.length) return null;

  return (
    <PrintSection title="Uploaded Images and Files">
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
  );
}

export default function PrintPatientPage() {
  const { patientId } = useParams();
  const [patient, setPatient] = useState(null);
  const [attachments, setAttachments] = useState([]);

  useEffect(() => {
    getPatient(patientId).then(setPatient).catch(() => setPatient(null));
    getPatientAttachments(patientId).then(setAttachments).catch(() => setAttachments([]));
  }, [patientId]);

  if (!patient) return <Layout><section className="page-card">Loading...</section></Layout>;

  return (
    <Layout>
      <div className="print-document">
        <section className="page-card">
          <div className="mb-6 flex items-center justify-between no-print">
            <h1 className="text-2xl font-bold text-slate-900">Patient Record Printout</h1>
            <button className="button-primary" onClick={() => window.print()}>
              Print
            </button>
          </div>
          <header className="rounded-2xl border border-slate-300 p-5">
            <h1 className="text-3xl font-bold">Patient Record</h1>
            <p className="mt-2 text-lg font-medium">{patient.display_name}</p>
            <p className="mt-1 text-sm">{patient.patient_id} | Date Registered {patient.date_registered}</p>
            <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              Medical Alert Summary: {patient.medical_alert_summary || "No major medical alerts recorded."}
            </p>
          </header>

          <PrintSection title="Basic Information">
            <div className="print-field-grid">
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
            <div className="print-field-grid">
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
            <div className="print-field-grid">
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
            <div className="print-checklist">
              {medicalConditionFields.map(([fieldName, label]) => (
                <div key={fieldName} className="print-check-item">
                  <strong>{patient[fieldName] ? "[X]" : "[ ]"}</strong> {label}
                </div>
              ))}
            </div>
          </PrintSection>
        </section>

        <PrintableAttachments attachments={attachments} />
      </div>
    </Layout>
  );
}
