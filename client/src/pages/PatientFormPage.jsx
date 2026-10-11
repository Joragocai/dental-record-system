import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import PatientCreatedDialog from "../components/PatientCreatedDialog";
import ClearPatientFieldsDialog from "../components/ClearPatientFieldsDialog";
import { emptyPatient, medicalConditionFields, patientFieldGroups } from "../lib/forms";
import { isPwdRelatedClassification, shouldShowPatientClassificationInSummary } from "../lib/formatters";
import { createPatient, getNextPatientId, getPatient, updatePatient } from "../lib/api";
import { calculateAgeFromBirthday, validatePatientForm } from "../lib/validation";
import { clearPatientFormFields, hasPatientFieldsToClear, hasUnsavedPatientEdits, prepareNewPatientRegistration } from "../lib/patientFormReset";
import { usePatientUnsavedGuard } from "../lib/usePatientUnsavedGuard";
import "../patientRegistrationResponsive.css";

// Keep disability metadata owned by Medical History; display the field beside its related classification.
const disabilityTypeField = patientFieldGroups[1].fields.find(([name]) => name === "disability_type");

const allergySummaryFields = [
  ["allergy_local_anesthetic", "Local Anesthetic", "local_anesthetic_details"],
  ["allergy_penicillin", "Penicillin / Antibiotics"],
  ["allergy_sulfa", "Sulfa Drugs"],
  ["allergy_aspirin", "Aspirin"],
  ["allergy_latex", "Latex"],
  ["allergy_others", "Other Allergies", "allergy_others_details"]
];

function isChecked(value) {
  return value === "Yes" || value === 1 || value === true || value === "1";
}

function generateMedicalAlertSummary(form) {
  const sections = [];

  const selectedConditions = medicalConditionFields
    .filter(([field]) => isChecked(form[field]))
    .map(([, label]) => label);

  if (selectedConditions.length) {
    sections.push(`Medical conditions: ${selectedConditions.join(", ")}`);
  }

  const allergyAlerts = allergySummaryFields
    .filter(([field]) => form[field] === "Yes")
    .map(([, label, detailField]) => {
      const details = detailField ? String(form[detailField] || "").trim() : "";
      return details ? `${label} (${details})` : label;
    });

  if (allergyAlerts.length) {
    sections.push(`Allergies: ${allergyAlerts.join(", ")}`);
  }

  if (form.blood_type) {
    sections.push(`Blood Type: ${form.blood_type}`);
  }

  if (shouldShowPatientClassificationInSummary(form.discount_eligibility)) {
    sections.push(`Patient classification: ${form.discount_eligibility}`);
  }

  if (isPwdRelatedClassification(form.discount_eligibility) && form.disability_type) {
    sections.push(`Type of disability: ${form.disability_type}`);
  }

  if (form.pregnant === "Yes") {
    sections.push("Pregnancy: Pregnant");
  }

  if (form.under_medical_treatment === "Yes") {
    sections.push(`Medical Treatment: ${form.medical_treatment_details || "Under medical treatment"}`);
  }

  if (form.serious_illness_history === "Yes") {
    sections.push(`Serious Illness / Operation: ${form.serious_illness_details || "History reported"}`);
  }

  if (form.hospitalized_history === "Yes") {
    sections.push(`Hospitalization: ${form.hospitalization_details || "History reported"}`);
  }

  if (form.taking_medications === "Yes") {
    sections.push(`Medications: ${form.medication_details || "Medication reported"}`);
  }

  if (form.other_medical_condition === "Yes" && form.other_medical_condition_details) {
    sections.push(`Other Medical Condition: ${form.other_medical_condition_details}`);
  }

  return sections.join(" | ");
}

function hasFilledValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

function fieldClassName(hasError, hasValue) {
  if (hasError) return "text-input input-error";
  return hasValue ? "text-input input-filled" : "text-input";
}

function textAreaClassName(hasError, hasValue) {
  if (hasError) return "text-area input-error";
  return hasValue ? "text-area input-filled" : "text-area";
}

function selectClassName(hasError, hasValue) {
  if (hasError) return "select-input input-error";
  return hasValue ? "select-input input-filled" : "select-input";
}

function LabelText({ label, required = false }) {
  return (
    <span className="label-text">
      {label}
      {required ? <span className="text-red-500"> *</span> : null}
    </span>
  );
}

function InputField({ field, value, onChange, error }) {
  const [name, label, type, required, readOnly, options, helperText] = field;
  const currentValue = value ?? "";
  const isFilled = hasFilledValue(currentValue);
  const selectOptions =
    type === "select" && currentValue && !options.includes(currentValue)
      ? [...options, currentValue]
      : options;

  if (type === "textarea") {
    return (
      <label className="field-box">
        <LabelText label={label} required={required} />
        <textarea name={name} aria-invalid={Boolean(error)} className={textAreaClassName(Boolean(error), isFilled)} value={value ?? ""} onChange={(event) => onChange(name, event.target.value)} />
        {helperText && <p className="mt-1 text-xs text-slate-500">{helperText}</p>}
        {error && <p className="error-text">{error}</p>}
      </label>
    );
  }

  if (type === "select") {
    return (
      <label className="field-box">
        <LabelText label={label} required={required} />
        <select name={name} aria-invalid={Boolean(error)} className={selectClassName(Boolean(error), isFilled)} value={currentValue} onChange={(event) => onChange(name, event.target.value)}>
          {selectOptions.map((option) => (
            <option key={option} value={option}>
              {option || "Select"}
            </option>
          ))}
        </select>
        {helperText && <p className="mt-1 text-xs text-slate-500">{helperText}</p>}
        {error && <p className="error-text">{error}</p>}
      </label>
    );
  }

  if (type === "datalist") {
    const datalistId = `patient-${name}-options`;

    return (
      <label className="field-box">
        <LabelText label={label} required={required} />
        <div className="datalist-input-wrap">
          <input
            type="text"
            name={name}
            aria-invalid={Boolean(error)}
            list={datalistId}
            className={`${fieldClassName(Boolean(error), isFilled)} pr-10`}
            value={currentValue}
            readOnly={Boolean(readOnly)}
            required={Boolean(required)}
            onChange={(event) => onChange(name, event.target.value)}
          />
          <span className="datalist-input-arrow" aria-hidden="true">
            ▾
          </span>
        </div>
        <datalist id={datalistId}>
          {options?.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
        {helperText && <p className="mt-1 text-xs text-slate-500">{helperText}</p>}
        {error && <p className="error-text">{error}</p>}
      </label>
    );
  }

  return (
    <label className="field-box">
      <LabelText label={label} required={required} />
      <input
        type={type}
        name={name}
        aria-invalid={Boolean(error)}
        className={fieldClassName(Boolean(error), isFilled)}
        value={value ?? ""}
        readOnly={Boolean(readOnly)}
        required={Boolean(required)}
        onChange={(event) => onChange(name, event.target.value)}
      />
      {helperText && <p className="mt-1 text-xs text-slate-500">{helperText}</p>}
      {error && <p className="error-text">{error}</p>}
    </label>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="form-section min-w-0">
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
  const formRef = useRef(null);
  const savingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadedPatient, setLoadedPatient] = useState(null);
  const [saveSucceeded, setSaveSucceeded] = useState(false);
  const [createdPatient, setCreatedPatient] = useState(null);
  const [isPreparingAnother, setIsPreparingAnother] = useState(false);
  const [nextPatientError, setNextPatientError] = useState("");
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
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
          const loaded = { ...emptyPatient, ...data, age: data.age ?? calculateAgeFromBirthday(data.birthday) };
          setLoadedPatient(loaded);
          setForm(loaded);
        })
        .catch(() => setStatus("Unable to load patient record."));
      return;
    }

    loadNewPatientMetadata();
  }, [mode, patientId]);

  const hasUnsavedChanges = mode === "edit" ? hasUnsavedPatientEdits(form, loadedPatient) : hasPatientFieldsToClear(form);
  usePatientUnsavedGuard(hasUnsavedChanges && !isSaving && !saveSucceeded);

  function handleChange(name, value) {
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === "birthday") next.age = calculateAgeFromBirthday(value);
      if (name === "discount_eligibility" && !isPwdRelatedClassification(value)) {
        next.disability_type = "";
      }
      next.medical_alert_summary = generateMedicalAlertSummary(next);
      return next;
    });
    setErrors((current) => {
      const next = { ...current };
      delete next[name];
      if (name === "discount_eligibility" && !isPwdRelatedClassification(value)) {
        delete next.disability_type;
      }
      return next;
    });
    setStatus("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (savingRef.current) return;

    const validation = validatePatientForm({ ...form, medical_alert_summary: generateMedicalAlertSummary(form) });
    if (!validation.isValid) {
      setErrors(validation.errors);
      setStatus("Review the highlighted patient fields before saving.");
      const firstInvalidName = Object.keys(validation.errors).find((name) => formRef.current?.elements.namedItem(name));
      if (firstInvalidName) {
        window.requestAnimationFrame(() => {
          const field = formRef.current?.elements.namedItem(firstInvalidName);
          if (!field) return;
          field.focus({ preventScroll: true });
          field.scrollIntoView({
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
            block: "center"
          });
        });
      }
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    setStatus("");
    try {
      const data = mode === "edit" ? await updatePatient(patientId, validation.normalized) : await createPatient(validation.normalized);
      setSaveSucceeded(true);
      if (mode === "create") setCreatedPatient(data);
      else navigate(`/patients/${data.patient_id}`, { state: { saveNotice: { kind: "patient-updated" } } });
    } catch (error) {
      setStatus(error.response?.data?.message || "Unable to save patient record.");
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  async function registerAnotherPatient() {
    if (!createdPatient || isPreparingAnother) return;
    setIsPreparingAnother(true);
    setNextPatientError("");
    try {
      const metadata = await getNextPatientId();
      const next = prepareNewPatientRegistration(metadata, createdPatient.patient_id);
      setForm(next);
      setErrors({});
      setStatus("");
      setCreatedPatient(null);
      setSaveSucceeded(false);
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch (error) {
      setNextPatientError(error.response?.data?.message || error.message || "Unable to prepare another patient. Please retry.");
    } finally {
      setIsPreparingAnother(false);
    }
  }

  function viewCreatedPatient() {
    if (!createdPatient) return;
    navigate(`/patients/${createdPatient.patient_id}`);
  }

  function requestClearNewPatientFields() {
    if (mode !== "create" || savingRef.current || createdPatient) return;
    if (hasPatientFieldsToClear(form)) {
      setShowClearConfirmation(true);
      return;
    }
    clearNewPatientFields();
  }

  function clearNewPatientFields() {
    if (mode !== "create" || savingRef.current || createdPatient) return;
    setForm((current) => clearPatientFormFields(current));
    setErrors({});
    setStatus("");
    setShowClearConfirmation(false);
  }

  const patientName = [form.last_name, [form.first_name, form.middle_name].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const hasMedicalAlert = Boolean(form.medical_alert_summary);

  return (
    <Layout contentClassName="patient-registration-page">
      <form id="patient-record-form" ref={formRef} onSubmit={handleSubmit} noValidate aria-busy={isSaving} className="patient-registration-form min-w-0 space-y-4 pb-32 sm:space-y-6 sm:pb-28">
        <div className="no-print -mb-2">
          <Link
            to={mode === "edit" && patientId ? `/patients/${patientId}` : "/patients"}
            aria-label={mode === "edit" ? "Back to Patient Details" : "Back to Patient Search"}
            className="inline-flex min-h-10 w-fit items-center gap-2 rounded-lg px-2 text-sm font-medium text-clinic-700 transition-colors duration-200 ease-out hover:bg-clinic-50 hover:text-clinic-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clinic-700"
          >
            <span aria-hidden="true">←</span> {mode === "edit" ? "Patient Details" : "Patient Search"}
          </Link>
        </div>
        <section className="page-card min-w-0">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] text-clinic-700 sm:text-sm sm:tracking-[0.25em]">Dental Clinic Record Form</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
            <p className="mt-2 text-sm text-slate-600">Capture registration, contact, medical history, allergies, and risk indicators in one clean record.</p>
          </div>

          <div className="patient-registration-summary mt-5 grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="record-tile col-span-2 min-w-0 sm:col-span-1">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Patient Name</p>
              <p className="mt-2 break-words text-base font-semibold text-slate-900 [overflow-wrap:anywhere] sm:text-lg">{patientName || "-"}</p>
            </div>
            <div className="record-tile">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Date Registered</p>
              <p className="mt-2 break-words text-sm font-semibold text-slate-900 [overflow-wrap:anywhere] sm:text-xl">{form.date_registered || "-"}</p>
            </div>
            <div className="record-tile">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Patient ID</p>
              <p className="mt-2 break-words text-sm font-semibold text-slate-900 [overflow-wrap:anywhere] sm:text-xl">{form.patient_id || "-"}</p>
            </div>
          </div>
          <div
            className={`mt-4 rounded-2xl px-4 py-4 ${
              hasMedicalAlert ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            <p className={`text-xs uppercase tracking-[0.2em] ${hasMedicalAlert ? "text-rose-700" : "text-slate-500"}`}>
              Medical Alert Summary
            </p>
            <p className="mt-2 whitespace-normal break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
              {form.medical_alert_summary || "No major medical alerts generated yet."}
            </p>
          </div>

          {status && <p className="feedback-message mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{status}</p>}
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
            {patientFieldGroups[0].fields.map((field) =>
              field[0] === "discount_eligibility" ? (
                <div key={field[0]} className="classification-field-card field-box flex min-w-0 flex-col gap-2">
                  <label className="block min-w-0">
                    <LabelText label={field[1]} />
                    <select
                      name="discount_eligibility"
                      aria-invalid={Boolean(errors.discount_eligibility)}
                      className={`${selectClassName(Boolean(errors.discount_eligibility), hasFilledValue(form.discount_eligibility))} classification-compact-select`}
                      value={form.discount_eligibility ?? "None"}
                      onChange={(event) => handleChange("discount_eligibility", event.target.value)}
                    >
                      {(form.discount_eligibility && !field[5].includes(form.discount_eligibility)
                        ? [...field[5], form.discount_eligibility]
                        : field[5]).map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  {isPwdRelatedClassification(form.discount_eligibility) && disabilityTypeField ? (
                    <label className="block min-w-0">
                      <LabelText label={disabilityTypeField[1]} />
                      <select
                        name="disability_type"
                        aria-invalid={Boolean(errors.disability_type)}
                        className={`${selectClassName(Boolean(errors.disability_type), hasFilledValue(form.disability_type))} classification-compact-select`}
                        value={form.disability_type ?? ""}
                        onChange={(event) => handleChange("disability_type", event.target.value)}
                      >
                        <option value="">Select disability</option>
                        {(form.disability_type && !disabilityTypeField[5].includes(form.disability_type)
                          ? [...disabilityTypeField[5], form.disability_type]
                          : disabilityTypeField[5]).map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                  ) : null}
                </div>
              ) : (
                <InputField key={field[0]} field={field} value={form[field[0]]} onChange={handleChange} error={errors[field[0]]} />
              )
            )}
          </div>
        </Section>

        <Section title="Medical History" description="Use Yes/No answers and complete the related details when a risk answer is Yes.">
          <div className="form-grid">
            {patientFieldGroups[1].fields
              .filter((field) => field[0] !== "disability_type")
              .map((field) => (
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
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {medicalConditionFields.map(([name, label]) => (
              <label key={name} className="medical-condition-option flex min-h-11 min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0"
                  name={name}
                  checked={Boolean(form[name])}
                  onChange={(event) => handleChange(name, event.target.checked ? 1 : 0)}
                />
                <span className="min-w-0 break-words text-sm text-slate-700">{label}</span>
              </label>
            ))}
          </div>
        </Section>
        <div className="patient-registration-footer no-print fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-3 py-2.5 shadow-[0_-4px_16px_rgba(15,23,42,0.07)] backdrop-blur sm:px-6 sm:py-3">
          <div className="mx-auto flex max-w-7xl min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end lg:justify-between">
            <div className="hidden min-w-0 lg:block">
              <p className="text-sm font-semibold text-slate-800">{mode === "edit" ? "Update Patient Record" : "Patient Registration"}</p>
              <p role={status ? "alert" : undefined} className={`text-xs ${status ? "text-amber-700" : "text-slate-500"}`}>
                {status || (isSaving ? "Saving patient record..." : "Complete the required fields before saving.")}
              </p>
            </div>
            <div className="flex min-w-0 w-full items-center gap-2 sm:w-auto sm:gap-3">
              {mode === "create" ? (
                <button type="button" disabled={isSaving} onClick={requestClearNewPatientFields} className="button-secondary min-h-[50px] min-w-0 flex-[2] whitespace-nowrap px-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none sm:px-5">
                  Clear Fields
                </button>
              ) : null}
              <button type="submit" disabled={isSaving} className="button-primary min-h-[50px] min-w-0 flex-[3] whitespace-nowrap px-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-60 sm:w-[200px] sm:flex-none sm:px-5 sm:text-base">
                {isSaving ? "Saving..." : mode === "edit" ? "Update Patient" : "Save Patient"}
              </button>
            </div>
          </div>
        </div>
      </form>
      {showClearConfirmation ? (
        <ClearPatientFieldsDialog
          onCancel={() => setShowClearConfirmation(false)}
          onConfirm={clearNewPatientFields}
        />
      ) : null}
      {createdPatient ? (
        <PatientCreatedDialog
          patient={createdPatient}
          preparing={isPreparingAnother}
          error={nextPatientError}
          onRegisterAnother={registerAnotherPatient}
          onViewPatient={viewCreatedPatient}
        />
      ) : null}
    </Layout>
  );
}
