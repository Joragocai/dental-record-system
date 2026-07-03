import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import { emptyPatient, medicalConditionFields, patientFieldGroups } from "../lib/forms";
import { createPatient, getNextPatientId, getPatient, updatePatient } from "../lib/api";
import { calculateAgeFromBirthday, validatePatientForm } from "../lib/validation";

function generateMedicalAlertSummary(form) {
  const alerts = [];
  if (form.allergy_local_anesthetic === "Yes") alerts.push("Local anesthetic allergy");
  if (form.allergy_penicillin === "Yes") alerts.push("Penicillin or antibiotics allergy");
  if (form.allergy_latex === "Yes") alerts.push("Latex allergy");
  if (form.condition_diabetes) alerts.push("Diabetes");
  if (form.condition_high_blood_pressure) alerts.push("High blood pressure");
  if (form.condition_heart_disease) alerts.push("Heart disease");
  if (form.condition_bleeding_problems) alerts.push("Bleeding problems");
  if (form.pregnant === "Yes") alerts.push("Pregnant");
  if (form.other_medical_condition === "Yes" && form.other_medical_condition_details) alerts.push(form.other_medical_condition_details);
  return alerts.join(", ");
}

function fieldClassName(hasError) {
  return hasError ? "text-input input-error" : "text-input";
}

function textAreaClassName(hasError) {
  return hasError ? "text-area input-error" : "text-area";
}

function selectClassName(hasError) {
  return hasError ? "select-input input-error" : "select-input";
}

function InputField({ field, value, onChange, error }) {
  const [name, label, type, required, readOnly, options] = field;
  const currentValue = value ?? "";
  const selectOptions =
    type === "select" && currentValue && !options.includes(currentValue)
      ? [...options, currentValue]
      : options;

  if (type === "textarea") {
    return (
      <label className="field-box">
        <span className="label-text">{label}{required ? " *" : ""}</span>
        <textarea className={textAreaClassName(Boolean(error))} value={value ?? ""} onChange={(event) => onChange(name, event.target.value)} />
        {error && <p className="error-text">{error}</p>}
      </label>
    );
  }

  if (type === "select") {
    return (
      <label className="field-box">
        <span className="label-text">{label}{required ? " *" : ""}</span>
        <select className={selectClassName(Boolean(error))} value={currentValue} onChange={(event) => onChange(name, event.target.value)}>
          {selectOptions.map((option) => (
            <option key={option} value={option}>
              {option || "Select"}
            </option>
          ))}
        </select>
        {error && <p className="error-text">{error}</p>}
      </label>
    );
  }

  return (
    <label className="field-box">
      <span className="label-text">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type={type}
        className={fieldClassName(Boolean(error))}
        value={value ?? ""}
        readOnly={Boolean(readOnly)}
        required={Boolean(required)}
        onChange={(event) => onChange(name, event.target.value)}
      />
      {error && <p className="error-text">{error}</p>}
    </label>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="form-section">
      <div className="form-section-header">
        <h2 className="section-title">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      </div>
      <div className="form-section-body">{children}</div>
    </section>
  );
}

export default function PatientFormPage({ mode = "create" }) {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyPatient);
  const [status, setStatus] = useState("");
  const [errors, setErrors] = useState({});

  const title = useMemo(() => (mode === "edit" ? "Update Patient" : "New Patient"), [mode]);

  function handleNextPatientIdError() {
    setStatus("Unable to generate the next patient ID. Please confirm the backend is running at http://127.0.0.1:3002.");
  }

  function loadNewPatientMetadata() {
    getNextPatientId()
      .then((data) =>
        setForm({
          ...emptyPatient,
          patient_id: data.patient_id,
          date_registered: data.date_registered
        })
      )
      .catch(() => handleNextPatientIdError());
  }

  useEffect(() => {
    if (mode === "edit" && patientId) {
      getPatient(patientId)
        .then((data) => {
          setForm({ ...emptyPatient, ...data, age: data.age ?? calculateAgeFromBirthday(data.birthday) });
        })
        .catch(() => setStatus("Unable to load patient record."));
      return;
    }

    loadNewPatientMetadata();
  }, [mode, patientId]);

  function handleChange(name, value) {
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === "birthday") next.age = calculateAgeFromBirthday(value);
      next.medical_alert_summary = generateMedicalAlertSummary(next);
      return next;
    });
    setErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    setStatus("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const validation = validatePatientForm({ ...form, medical_alert_summary: generateMedicalAlertSummary(form) });
    if (!validation.isValid) {
      setErrors(validation.errors);
      setStatus("Review the highlighted patient fields before saving.");
      return;
    }

    try {
      const data = mode === "edit" ? await updatePatient(patientId, validation.normalized) : await createPatient(validation.normalized);
      navigate(`/patients/${data.patient_id}`);
    } catch (error) {
      setStatus(error.response?.data?.message || "Unable to save patient record.");
    }
  }

  function resetNewPatient() {
    setErrors({});
    setStatus("");
    loadNewPatientMetadata();
  }

  const patientName = [form.last_name, [form.first_name, form.middle_name].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  return (
    <Layout>
      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="page-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-clinic-700">Dental Clinic Record Form</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">{title}</h1>
              <p className="mt-2 text-sm text-slate-600">Capture registration, contact, medical history, allergies, and risk indicators in one clean record.</p>
            </div>
            <div className="no-print flex flex-wrap gap-3">
              {mode === "create" && (
                <button type="button" onClick={resetNewPatient} className="button-secondary">
                  New Patient
                </button>
              )}
              <button type="submit" className="button-primary">
                {mode === "edit" ? "Update Patient" : "Save Patient"}
              </button>
              {mode === "edit" && (
                <Link className="button-secondary" to={`/patients/${patientId}`}>
                  Load Patient
                </Link>
              )}
            </div>
          </div>

          <div className="record-grid mt-5">
            <div className="record-tile">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Patient ID</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{form.patient_id || "-"}</p>
            </div>
            <div className="record-tile">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Date Registered</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{form.date_registered || "-"}</p>
            </div>
            <div className="record-tile">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Patient Name</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{patientName || "-"}</p>
            </div>
            <div className="status-strip">
              <p className="text-xs uppercase tracking-[0.2em] text-clinic-700">Medical Alert Summary</p>
              <p className="mt-2 text-sm font-medium text-clinic-900">{form.medical_alert_summary || "No major medical alerts generated yet."}</p>
            </div>
          </div>

          {status && <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{status}</p>}
          {mode === "create" && status.includes("Unable to generate the next patient ID") && (
            <div className="mt-4">
              <button type="button" onClick={loadNewPatientMetadata} className="button-secondary">
                Retry Generate Patient ID
              </button>
            </div>
          )}
        </section>

        <Section title="Registration and Contact" description="Core patient identity and clinic contact details.">
          <div className="form-grid">
            {patientFieldGroups[0].fields.map((field) => (
              <InputField key={field[0]} field={field} value={form[field[0]]} onChange={handleChange} error={errors[field[0]]} />
            ))}
          </div>
        </Section>

        <Section title="Medical History" description="Use Yes/No answers and complete the related details when a risk answer is Yes.">
          <div className="form-grid">
            {patientFieldGroups[1].fields.map((field) => (
              <InputField key={field[0]} field={field} value={form[field[0]]} onChange={handleChange} error={errors[field[0]]} />
            ))}
          </div>
        </Section>

        <Section title="Allergies and Medical Risk" description="Document allergies, blood information, and other immediate treatment risks.">
          <div className="form-grid">
            {patientFieldGroups[2].fields.map((field) => (
              <InputField key={field[0]} field={field} value={form[field[0]]} onChange={handleChange} error={errors[field[0]]} />
            ))}
          </div>
        </Section>

        <Section title="Medical Condition Checklist" description="Mark all conditions that apply to the patient.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {medicalConditionFields.map(([name, label]) => (
              <label key={name} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={Boolean(form[name])}
                  onChange={(event) => handleChange(name, event.target.checked ? 1 : 0)}
                />
                <span className="text-sm text-slate-700">{label}</span>
              </label>
            ))}
          </div>
        </Section>
      </form>
    </Layout>
  );
}
