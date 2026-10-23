import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import AttachmentGallery from "../components/AttachmentGallery";
import AttachmentUploadForm from "../components/AttachmentUploadForm";
import Layout from "../components/Layout";
import TreatmentHistoryTable from "../components/TreatmentHistoryTable";
import PatientTreatmentCards from "../components/PatientTreatmentCards";
import { emptyTreatment, suggestedDentists, suggestedTreatmentProcedures, treatmentDiscountTypes } from "../lib/forms";
import {
  createTreatment,
  getNextTreatmentId,
  getPatient,
  getTreatment,
  getTreatmentAttachments,
  getTreatmentsByPatient,
  searchPatients,
  updateTreatment
} from "../lib/api";
import { formatPesoAmount } from "../lib/formatters";
import { getManilaTodayIso } from "../lib/clinicDate";
import { DASHBOARD_SCHEDULE_ORIGIN, isDashboardScheduleOrigin } from "../lib/dashboardSchedule";
import { getTreatmentFooterCopy, getTreatmentHistoryOriginState } from "../lib/treatmentFormPresentation";
import { calculateTreatmentAmounts, getTreatmentDiscountDefaultsFromEligibility, validateTreatmentForm } from "../lib/validation";
import "../treatmentEntryResponsive.css";

function hasFilledValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

function inputClass(hasError, hasValue) {
  if (hasError) return "text-input input-error";
  return hasValue ? "text-input input-filled" : "text-input";
}

function areaClass(hasError, hasValue) {
  if (hasError) return "text-area input-error";
  return hasValue ? "text-area input-filled" : "text-area";
}

function selectClass(hasError, hasValue) {
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

function formatEditableAmount(value, fallback = "") {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? String(value) : numeric.toFixed(2);
}

function todayIsoDate() {
  return getManilaTodayIso();
}

function buildTreatmentFormState(current, updates = {}) {
  const next = { ...current, ...updates };
  const computed = calculateTreatmentAmounts(next);
  return { ...next, ...computed };
}

function normalizeTreatmentForm(data) {
  return buildTreatmentFormState(
    {
      ...emptyTreatment,
      ...data,
      treatment_date: data.treatment_date || todayIsoDate(),
      next_appointment_date: data.next_appointment_date || data.next_appointment || "",
      next_appointment_time: data.next_appointment_time || "",
      amount_charged: formatEditableAmount(data.amount_charged),
      discount_percent: formatEditableAmount(data.discount_percent, "0.00"),
      amount_paid: formatEditableAmount(data.amount_paid),
      discount_amount: formatEditableAmount(data.discount_amount, "0.00"),
      net_amount_due: formatEditableAmount(data.net_amount_due, formatEditableAmount(data.amount_charged, "0.00")),
      balance: formatEditableAmount(data.balance)
    }
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

function TreatmentFormFooterInfo({ mode, isSaving, status }) {
  const { title, message } = getTreatmentFooterCopy(mode, isSaving, status);

  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p
        role={status ? "alert" : undefined}
        aria-live={isSaving && !status ? "polite" : undefined}
        className={`mt-0.5 break-words text-xs ${status ? "text-amber-700" : "text-slate-500"}`}
      >
        {message}
      </p>
    </div>
  );
}

function TreatmentFormActionButtons({ mode, isSaving, onClear }) {
  return (
    <div className={`grid w-full min-w-0 gap-2 ${mode === "create" ? "grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]" : "grid-cols-1"} sm:flex sm:w-auto sm:items-center sm:justify-end sm:gap-3`}>
      {mode === "create" ? (
        <button
          type="button"
          disabled={isSaving}
          className="button-secondary min-h-11 min-w-0 px-2 text-sm disabled:opacity-60 sm:min-h-[50px] sm:px-4"
          onClick={onClear}
        >
          Clear Fields
        </button>
      ) : null}
      <button
        type="submit"
        disabled={isSaving}
        className="button-primary min-h-11 min-w-0 px-2 text-sm disabled:opacity-60 sm:min-h-[50px] sm:min-w-[200px] sm:px-4 sm:text-base"
      >
        {isSaving ? "Saving..." : mode === "edit" ? "Update Treatment" : "Save Treatment"}
      </button>
    </div>
  );
}

export default function TreatmentFormPage({ mode = "create" }) {
  const { treatmentId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fromDashboardSchedule = mode === "edit" && isDashboardScheduleOrigin(location.state);
  const restoredDraft = mode === "create" && location.state?.treatmentDraft?.form ? location.state.treatmentDraft : null;
  const savingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const procedureDatalistId = "suggested-treatment-procedures";
  const dentistDatalistId = "suggested-treatment-dentists";
  const [patientQuery, setPatientQuery] = useState("");
  const [patientResults, setPatientResults] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(restoredDraft?.patient || null);
  const [history, setHistory] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [form, setForm] = useState(restoredDraft?.form || { ...emptyTreatment, balance: "" });
  const [status, setStatus] = useState("");
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const initialPatientId = searchParams.get("patientId");
    if (mode === "edit" && treatmentId) {
      getTreatment(treatmentId)
        .then(async (data) => {
          setForm(normalizeTreatmentForm(data));
          const patient = await getPatient(data.patient_id);
          setSelectedPatient(patient);
        })
        .catch(() => setStatus("Unable to load treatment."));
      getTreatmentAttachments(treatmentId).then(setAttachments).catch(() => setAttachments([]));
      return;
    }

    if (restoredDraft) return;
    getNextTreatmentId()
      .then((data) =>
        setForm((current) =>
          buildTreatmentFormState({
            ...current,
            treatment_id: data.treatment_id,
            treatment_date: current.treatment_date || todayIsoDate()
          })
        )
      )
      .catch(() => setStatus("Unable to generate the next treatment ID."));
    setAttachments([]);

    if (initialPatientId) {
      getPatient(initialPatientId)
        .then((data) => setSelectedPatient(data))
        .catch(() => {});
    }
  }, [mode, searchParams, treatmentId]);

  useEffect(() => {
    if (!selectedPatient?.patient_id) {
      setHistory([]);
      return;
    }
    setForm((current) => {
      const next = { ...current, patient_id: selectedPatient.patient_id };
      if (mode === "create" && !restoredDraft) {
        // Common clinic billing rules often use 20% for Senior Citizen/PWD covered services.
        // VAT treatment and final billing policy should still be verified with the clinic/accountant.
        const defaults = getTreatmentDiscountDefaultsFromEligibility(selectedPatient.discount_eligibility);
        next.discount_type = defaults.discount_type;
        next.discount_percent = defaults.discount_percent;
      }
      next.treatment_date = next.treatment_date || todayIsoDate();
      return buildTreatmentFormState(next);
    });
    // Hide the previous patient's rows immediately and ignore a late response
    // after switching patients so history actions always belong to the selection.
    setHistory([]);
    let cancelled = false;
    getTreatmentsByPatient(selectedPatient.patient_id)
      .then((records) => { if (!cancelled) setHistory(records); })
      .catch(() => { if (!cancelled) setHistory([]); });
    return () => { cancelled = true; };
  }, [mode, selectedPatient]);

  useEffect(() => {
    if (!patientQuery.trim()) {
      setPatientResults([]);
      return;
    }
    // Discard an outdated response after the query changes or a patient is selected.
    let cancelled = false;
    searchPatients(patientQuery.trim())
      .then((results) => { if (!cancelled) setPatientResults(results); })
      .catch(() => { if (!cancelled) setPatientResults([]); });
    return () => { cancelled = true; };
  }, [patientQuery]);

  function handleChange(name, value) {
    setForm((current) => {
      const next = { ...current, [name]: value };

      if (name === "discount_type") {
        if (value === "Senior Citizen" || value === "PWD" || value === "Senior Citizen/PWD") {
          next.discount_percent = "20.00";
        } else if (value === "None") {
          next.discount_percent = "0.00";
        } else if (!current.discount_percent) {
          next.discount_percent = "0.00";
        }
      }

      if (name === "discount_percent" && value === "") {
        next.discount_percent = "";
      }

      return buildTreatmentFormState(next);
    });
    setErrors((current) => {
      const next = { ...current };
      delete next[name];
      if (["amount_charged", "amount_paid", "discount_percent", "discount_type"].includes(name)) {
        delete next.discount_amount;
        delete next.net_amount_due;
        delete next.balance;
      }
      return next;
    });
    setStatus("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (savingRef.current) return;
    const validation = validateTreatmentForm(form, selectedPatient);
    if (!validation.isValid) {
      setErrors(validation.errors);
      setStatus("Review the highlighted treatment fields before saving.");
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    try {
      const data = mode === "edit" ? await updateTreatment(treatmentId, validation.normalized) : await createTreatment(validation.normalized);
      navigate(`/treatments/${data.treatment_id}`, {
        state: { saveNotice: { kind: mode === "edit" ? "treatment-updated" : "treatment-created" }, ...(fromDashboardSchedule ? DASHBOARD_SCHEDULE_ORIGIN : {}) }
      });
    } catch (error) {
      setStatus(error.response?.data?.message || "Unable to save treatment.");
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  function handleSelectPatient(patient) {
    setSelectedPatient(patient);
    setPatientQuery("");
    setPatientResults([]);
    setErrors((current) => {
      const next = { ...current };
      delete next.patient_id;
      return next;
    });
  }

  function refreshAttachments() {
    if (!treatmentId) return Promise.resolve();
    return getTreatmentAttachments(treatmentId)
      .then(setAttachments)
      .catch((error) => {
        setAttachments([]);
        throw error;
      });
  }

  // Both desktop rows and mobile history cards must carry the same draft
  // so returning from a treatment record restores the in-progress entry.
  const historyOriginState = getTreatmentHistoryOriginState(mode, form, selectedPatient);

  return (
    <Layout contentClassName="treatment-entry-page record-detail-wide-shell">
      <form onSubmit={handleSubmit} className="treatment-entry-form min-w-0 space-y-4 pb-5 sm:space-y-6 sm:pb-28">
        <div className="no-print -mb-2">
          <Link to={fromDashboardSchedule ? "/" : mode === "edit" ? `/treatments/${treatmentId}` : searchParams.get("patientId") ? `/patients/${searchParams.get("patientId")}` : "/patients"} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-clinic-700 transition-colors duration-200 hover:bg-clinic-50 hover:text-clinic-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clinic-700">← {fromDashboardSchedule ? "Home" : mode === "edit" ? "Treatment Record" : searchParams.get("patientId") ? "Patient Record" : "Patient Search"}</Link>
        </div>
        <section className="page-card treatment-page-overview min-w-0 space-y-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] text-clinic-700 sm:text-sm sm:tracking-[0.25em]">Dental Treatment Record</p>
            <h1 className="mt-1.5 text-2xl font-bold text-slate-900 sm:mt-2 sm:text-3xl">{mode === "edit" ? "Update Treatment" : "New Treatment"}</h1>
            <p className="mt-1.5 text-sm text-slate-600 sm:mt-2">Select a patient first, then record the treatment details and financial balance clearly.</p>
          </div>

          <dl aria-label="Treatment and patient summary" className="treatment-summary-panel grid min-w-0 grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-5">
            <div className="treatment-summary-detail record-tile min-w-0">
              <dt className="treatment-summary-label text-xs uppercase tracking-[0.15em] text-slate-500">Treatment ID</dt>
              <dd className="treatment-summary-value mt-2 text-base font-semibold text-slate-900 sm:text-xl">{form.treatment_id || "-"}</dd>
            </div>
            <div className="treatment-summary-detail record-tile min-w-0">
              <dt className="treatment-summary-label text-xs uppercase tracking-[0.15em] text-slate-500">Patient ID</dt>
              <dd className="treatment-summary-value mt-2 text-base font-semibold text-slate-900 sm:text-xl">{selectedPatient?.patient_id || form.patient_id || "-"}</dd>
            </div>
            <div className="treatment-summary-detail record-tile min-w-0">
              <dt className="treatment-summary-label text-xs uppercase tracking-[0.15em] text-slate-500">Selected Patient</dt>
              <dd className="treatment-summary-value mt-2 text-sm font-semibold text-slate-900">{selectedPatient?.display_name || "No patient selected yet"}</dd>
            </div>
            <div className="treatment-summary-detail record-tile min-w-0">
              <dt className="treatment-summary-label text-xs uppercase tracking-[0.12em] text-slate-500">Patient Classification</dt>
              <dd className="treatment-summary-value mt-2 text-sm font-semibold text-slate-900">{selectedPatient?.discount_eligibility || "None"}</dd>
            </div>
            <div className="treatment-summary-balance status-strip col-span-2 min-w-0 lg:col-span-1">
              <dt className="treatment-summary-label text-xs uppercase tracking-[0.15em] text-clinic-700">Current Balance</dt>
              <dd className="treatment-summary-value mt-2 text-xl font-semibold text-clinic-900">{formatPesoAmount(form.balance || 0)}</dd>
            </div>
          </dl>

          {status && <p className="feedback-message rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-700 sm:px-4 sm:py-3">{status}</p>}
        </section>

        <Section title="Patient Selector" description="Search and select the patient before adding or updating treatment.">
          <label className="field-box block min-w-0">
            <span className="label-text">Search Patient</span>
            <input
              type="search"
              autoComplete="off"
              className={inputClass(Boolean(errors.patient_id), hasFilledValue(patientQuery))}
              value={patientQuery}
              onChange={(event) => setPatientQuery(event.target.value)}
              placeholder="Name, ID, or mobile"
            />
            {errors.patient_id && <p className="error-text">{errors.patient_id}</p>}
          </label>

          {patientResults.length > 0 && (
            <div className="mt-3 min-w-0 sm:mt-4">
              <ul aria-label="Patient search results" className="space-y-2 md:hidden">
                {patientResults.map((patient) => (
                  <li key={patient.patient_id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => handleSelectPatient(patient)}
                      className="treatment-patient-result flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clinic-700"
                      aria-label={`Select patient ${patient.display_name}, ${patient.patient_id}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">{patient.display_name}</span>
                        <span className="mt-0.5 block text-xs text-slate-600 [overflow-wrap:anywhere]">{patient.patient_id} · Mobile {patient.mobile_number || "-"}</span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-clinic-700">Select <span aria-hidden="true">→</span></span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="hidden min-w-0 overflow-x-auto rounded-2xl border border-slate-200 md:block">
                <table className="w-full min-w-[640px] divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th scope="col" className="px-4 py-3">Patient</th>
                      <th scope="col" className="px-4 py-3">Patient ID</th>
                      <th scope="col" className="px-4 py-3">Mobile Number</th>
                      <th scope="col" className="px-4 py-3">Select</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {patientResults.map((patient) => (
                      <tr key={patient.patient_id}>
                        <td className="break-words px-4 py-3 [overflow-wrap:anywhere]">{patient.display_name}</td>
                        <td className="break-words px-4 py-3 [overflow-wrap:anywhere]">{patient.patient_id}</td>
                        <td className="px-4 py-3">{patient.mobile_number || "-"}</td>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => handleSelectPatient(patient)} className="button-secondary min-h-11">
                            Select
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {selectedPatient && (
            <div className="treatment-selected-patient mt-3 min-w-0 rounded-xl border border-clinic-100 bg-clinic-50 px-3 py-2.5 text-sm text-clinic-900 sm:mt-4 sm:rounded-2xl sm:p-4">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="font-semibold">Selected Patient</p>
                <p className="min-w-0 break-words font-medium [overflow-wrap:anywhere]">{selectedPatient.display_name}</p>
              </div>
              <p className="mt-0.5 break-words [overflow-wrap:anywhere]">
                {selectedPatient.patient_id} · Mobile {selectedPatient.mobile_number || "-"} · Patient Classification: {selectedPatient.discount_eligibility || "None"}
              </p>
              {selectedPatient.discount_eligibility === "Senior Citizen and PWD" && (
                <p className="mt-2 text-xs text-amber-700">
                  Patient has both Senior Citizen and PWD eligibility. Apply only one discount basis unless the clinic confirms otherwise.
                </p>
              )}
            </div>
          )}
        </Section>

        <Section title="Treatment Entry Form" description="Record treatment details, follow-up information, and payment details in clearly separated sections.">
          <div className="space-y-4 sm:space-y-6">
            <div className="treatment-entry-panel rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">Record Information</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="field-box">
                  <span className="label-text">Treatment ID</span>
                  <input className={inputClass(false, hasFilledValue(form.treatment_id))} readOnly value={form.treatment_id} />
                  {errors.treatment_id && <p className="error-text">{errors.treatment_id}</p>}
                </label>
                <label className="field-box">
                  <span className="label-text">Patient ID</span>
                  <input className={inputClass(false, hasFilledValue(selectedPatient?.patient_id || form.patient_id))} readOnly value={selectedPatient?.patient_id || form.patient_id} />
                </label>
                <label className="field-box">
                  <span className="label-text">Patient Name</span>
                  <input className={inputClass(false, hasFilledValue(selectedPatient?.display_name || ""))} readOnly value={selectedPatient?.display_name || ""} />
                </label>
              </div>
            </div>

            <div className="treatment-entry-panel rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">Treatment Details</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="field-box">
                  <LabelText label="Treatment Date" required />
                  <input
                    type="date"
                    max={todayIsoDate()}
                    className={inputClass(Boolean(errors.treatment_date), hasFilledValue(form.treatment_date))}
                    value={form.treatment_date || ""}
                    onChange={(event) => handleChange("treatment_date", event.target.value)}
                  />
                  {errors.treatment_date && <p className="error-text">{errors.treatment_date}</p>}
                </label>
                <label className="field-box">
                  <LabelText label="Procedure" required />
                  <div className="datalist-input-wrap">
                    <input
                      className={`${inputClass(Boolean(errors.procedure), hasFilledValue(form.procedure))} pr-10`}
                      list={procedureDatalistId}
                      value={form.procedure || ""}
                      onChange={(event) => handleChange("procedure", event.target.value)}
                      placeholder="Choose or type procedure"
                    />
                    <span className="datalist-input-arrow" aria-hidden="true">
                      ▾
                    </span>
                  </div>
                  <datalist id={procedureDatalistId}>
                    {suggestedTreatmentProcedures.map((procedure) => (
                      <option key={procedure} value={procedure} />
                    ))}
                  </datalist>
                  {errors.procedure && <p className="error-text">{errors.procedure}</p>}
                </label>
                <label className="field-box">
                  <LabelText label="Dentist/s" required />
                  <div className="datalist-input-wrap">
                    <input
                      className={`${inputClass(Boolean(errors.dentists), hasFilledValue(form.dentists))} pr-10`}
                      list={dentistDatalistId}
                      value={form.dentists || ""}
                      onChange={(event) => handleChange("dentists", event.target.value)}
                      placeholder="Choose or type dentist"
                    />
                    <span className="datalist-input-arrow" aria-hidden="true">
                      ▾
                    </span>
                  </div>
                  <datalist id={dentistDatalistId}>
                    {suggestedDentists.map((dentist) => (
                      <option key={dentist} value={dentist} />
                    ))}
                  </datalist>
                  {errors.dentists && <p className="error-text">{errors.dentists}</p>}
                </label>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="field-box md:col-span-1">
                  <span className="label-text">Tooth No./s</span>
                  <input className={inputClass(Boolean(errors.tooth_numbers), hasFilledValue(form.tooth_numbers))} value={form.tooth_numbers || ""} onChange={(event) => handleChange("tooth_numbers", event.target.value)} />
                </label>
              </div>
              <div className="mt-4">
                <label className="field-box block min-w-0">
                  <span className="label-text">Remarks</span>
                  <textarea className={`${areaClass(Boolean(errors.remarks), hasFilledValue(form.remarks))} block w-full resize-y`} rows={4} value={form.remarks || ""} onChange={(event) => handleChange("remarks", event.target.value)} />
                </label>
              </div>
            </div>

            <div className="treatment-entry-panel rounded-2xl border border-clinic-100 bg-clinic-50/50 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-clinic-700">Follow-up Appointment</h3>
              <p className="mt-2 text-sm text-slate-600">Use this only if the patient already has a planned next visit.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="field-box">
                  <span className="label-text">Next Appointment Date</span>
                  <input
                    type="date"
                    className={inputClass(Boolean(errors.next_appointment_date), hasFilledValue(form.next_appointment_date))}
                    value={form.next_appointment_date || ""}
                    onChange={(event) => handleChange("next_appointment_date", event.target.value)}
                  />
                  {errors.next_appointment_date && <p className="error-text">{errors.next_appointment_date}</p>}
                </label>
                <label className="field-box">
                  <span className="label-text">Next Appointment Time</span>
                  <input
                    type="time"
                    className={inputClass(Boolean(errors.next_appointment_time), hasFilledValue(form.next_appointment_time))}
                    value={form.next_appointment_time || ""}
                    onChange={(event) => handleChange("next_appointment_time", event.target.value)}
                  />
                  <p className="mt-1 text-xs text-slate-500">Leave time blank if the exact appointment time is not yet final.</p>
                  {errors.next_appointment_time && <p className="error-text">{errors.next_appointment_time}</p>}
                </label>
              </div>
            </div>

            <div className="treatment-entry-panel rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">Payment Details</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="field-box">
                  <LabelText label="Amount Charged" required />
                  <input type="number" step="0.01" min="0" className={inputClass(Boolean(errors.amount_charged), hasFilledValue(form.amount_charged))} value={form.amount_charged || ""} onChange={(event) => handleChange("amount_charged", event.target.value)} />
                  <p className="mt-2 text-xs font-medium text-slate-500">{formatPesoAmount(form.amount_charged || 0)}</p>
                  {errors.amount_charged && <p className="error-text">{errors.amount_charged}</p>}
                </label>
                <label className="field-box">
                  <span className="label-text">Discount Type</span>
                  <select className={selectClass(Boolean(errors.discount_type), hasFilledValue(form.discount_type))} value={form.discount_type || "None"} onChange={(event) => handleChange("discount_type", event.target.value)}>
                    {treatmentDiscountTypes.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-slate-500">
                    Patient may have both Senior Citizen and PWD IDs, but the discount should not be doubled. Use only one applicable discount basis unless the clinic confirms otherwise.
                  </p>
                  {errors.discount_type && <p className="error-text">{errors.discount_type}</p>}
                </label>
                <label className="field-box">
                  <span className="label-text">Discount Percent</span>
                  <input type="number" step="0.01" min="0" max="100" className={inputClass(Boolean(errors.discount_percent), hasFilledValue(form.discount_percent))} value={form.discount_percent || ""} onChange={(event) => handleChange("discount_percent", event.target.value)} />
                  <p className="mt-2 text-xs font-medium text-slate-500">{Number(form.discount_percent || 0).toFixed(2)}%</p>
                  {errors.discount_percent && <p className="error-text">{errors.discount_percent}</p>}
                </label>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="field-box">
                  <span className="label-text">Discount Amount</span>
                  <input className={inputClass(Boolean(errors.discount_amount), hasFilledValue(form.discount_amount))} readOnly value={form.discount_amount || ""} />
                  <p className="mt-2 text-xs font-medium text-slate-500">{formatPesoAmount(form.discount_amount || 0)}</p>
                  {errors.discount_amount && <p className="error-text">{errors.discount_amount}</p>}
                </label>
                <label className="field-box">
                  <span className="label-text">Net Amount Due</span>
                  <input className={inputClass(Boolean(errors.net_amount_due), hasFilledValue(form.net_amount_due))} readOnly value={form.net_amount_due || ""} />
                  <p className="mt-2 text-xs font-medium text-slate-500">{formatPesoAmount(form.net_amount_due || 0)}</p>
                  {errors.net_amount_due && <p className="error-text">{errors.net_amount_due}</p>}
                </label>
                <label className="field-box">
                  <LabelText label="Amount Paid" required />
                  <input type="number" step="0.01" min="0" readOnly={mode === "edit"} className={inputClass(Boolean(errors.amount_paid), hasFilledValue(form.amount_paid))} value={form.amount_paid || ""} onChange={(event) => handleChange("amount_paid", event.target.value)} />
                  {mode === "edit" && <p className="mt-1 text-xs text-slate-600">Payments are managed through the treatment Payment History. Use Record Payment to add another payment.</p>}
                  <p className="mt-2 text-xs font-medium text-slate-500">{formatPesoAmount(form.amount_paid || 0)}</p>
                  {errors.amount_paid && <p className="error-text">{errors.amount_paid}</p>}

                </label>
              </div>
              {mode === "create" && Number(form.amount_paid) > 0 && <div className="mt-4 max-w-sm"><label className="field-box block"><span className="label-text">Initial Payment Method</span><select className="select-input" value={form.initial_payment_method || "Cash"} onChange={(event) => handleChange("initial_payment_method", event.target.value)}>{["Cash", "GCash", "Bank Transfer", "Card", "Other"].map((method) => <option key={method} value={method}>{method}</option>)}</select></label></div>}
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="field-box md:col-span-1">
                  <LabelText label="Balance" required />
                  <input className={inputClass(Boolean(errors.balance), hasFilledValue(form.balance))} readOnly value={form.balance || ""} />
                  <p className="mt-2 text-sm font-semibold text-clinic-900">{formatPesoAmount(form.balance || 0)}</p>
                  {errors.balance && <p className="error-text">{errors.balance}</p>}
                </label>
              </div>
            </div>
          </div>
        </Section>

        <div className="treatment-mobile-actions no-print rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:hidden" aria-label="Treatment form actions">
          <TreatmentFormFooterInfo mode={mode} isSaving={isSaving} status={status} />
          <div className="mt-3">
            <TreatmentFormActionButtons mode={mode} isSaving={isSaving} onClear={() => setShowClearConfirm(true)} />
          </div>
        </div>

        <Section title="Treatment History for Selected Patient" description="Only treatments under the selected patient are listed here.">
          <div className="md:hidden">
            <PatientTreatmentCards treatments={history} originState={historyOriginState} />
          </div>
          <div className="hidden min-w-0 md:block">
            <TreatmentHistoryTable treatments={history} fullPage originState={historyOriginState} />
          </div>
        </Section>

        <Section title="Treatment Attachments" description="Upload images and documents linked only to this treatment record.">
          {mode === "create" ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Save the treatment first before uploading treatment attachments.
            </div>
          ) : (
            <div className="space-y-6">
              <AttachmentUploadForm
                patientId={selectedPatient?.patient_id || form.patient_id}
                treatmentId={treatmentId}
                onUploaded={refreshAttachments}
                title="Upload Treatment Attachment"
                uploadButtonLabel="Upload Attachment"
                treatmentOnly
              />
              <AttachmentGallery attachments={attachments} title="Treatment Attachments" onDeleted={refreshAttachments} />
            </div>
          )}
        </Section>
        <div className="no-print fixed bottom-0 left-0 right-0 z-20 hidden border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.07)] backdrop-blur sm:block sm:px-6">
          <div className="mx-auto flex max-w-[110rem] min-w-0 items-center justify-end gap-4 lg:justify-between">
            <div className="hidden min-w-0 flex-1 sm:block">
              <TreatmentFormFooterInfo mode={mode} isSaving={isSaving} status={status} />
            </div>
            <TreatmentFormActionButtons mode={mode} isSaving={isSaving} onClear={() => setShowClearConfirm(true)} />
          </div>
        </div>
      </form>
      {showClearConfirm ? <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"><div role="alertdialog" aria-modal="true" aria-labelledby="clear-treatment-title" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setShowClearConfirm(false); } }} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h2 id="clear-treatment-title" className="text-lg font-semibold">Clear treatment fields?</h2><p className="mt-2 text-sm text-slate-600">Unsaved treatment details will be cleared. The selected patient and generated Treatment ID will be retained.</p><div className="mt-5 flex justify-end gap-3"><button type="button" className="button-secondary" onClick={() => setShowClearConfirm(false)}>Cancel</button><button type="button" className="button-danger" onClick={() => { setForm(current => buildTreatmentFormState({ ...emptyTreatment, treatment_id: current.treatment_id, patient_id: selectedPatient?.patient_id || "", treatment_date: todayIsoDate(), ...getTreatmentDiscountDefaultsFromEligibility(selectedPatient?.discount_eligibility) })); setErrors({}); setStatus(""); setShowClearConfirm(false); }}>Clear Fields</button></div></div></div> : null}
    </Layout>
  );
}
