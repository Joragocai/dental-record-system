import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import AttachmentGallery from "../components/AttachmentGallery";
import AttachmentUploadForm from "../components/AttachmentUploadForm";
import BackButton from "../components/BackButton";
import Layout from "../components/Layout";
import TreatmentHistoryTable from "../components/TreatmentHistoryTable";
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
import { calculateTreatmentAmounts, getTreatmentDiscountDefaultsFromEligibility, validateTreatmentForm } from "../lib/validation";

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

function formatEditableAmount(value, fallback = "") {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? String(value) : numeric.toFixed(2);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
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
    <section className="form-section">
      <div className="form-section-header">
        <h2 className="section-title">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      </div>
      <div className="form-section-body">{children}</div>
    </section>
  );
}

export default function TreatmentFormPage({ mode = "create" }) {
  const { treatmentId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const procedureDatalistId = "suggested-treatment-procedures";
  const dentistDatalistId = "suggested-treatment-dentists";
  const [patientQuery, setPatientQuery] = useState("");
  const [patientResults, setPatientResults] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [history, setHistory] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [form, setForm] = useState({ ...emptyTreatment, balance: "" });
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
      if (mode === "create") {
        // Common clinic billing rules often use 20% for Senior Citizen/PWD covered services.
        // VAT treatment and final billing policy should still be verified with the clinic/accountant.
        const defaults = getTreatmentDiscountDefaultsFromEligibility(selectedPatient.discount_eligibility);
        next.discount_type = defaults.discount_type;
        next.discount_percent = defaults.discount_percent;
      }
      next.treatment_date = next.treatment_date || todayIsoDate();
      return buildTreatmentFormState(next);
    });
    getTreatmentsByPatient(selectedPatient.patient_id).then(setHistory).catch(() => setHistory([]));
  }, [mode, selectedPatient]);

  useEffect(() => {
    if (!patientQuery.trim()) {
      setPatientResults([]);
      return;
    }
    searchPatients(patientQuery.trim()).then(setPatientResults).catch(() => setPatientResults([]));
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
    const validation = validateTreatmentForm(form, selectedPatient);
    if (!validation.isValid) {
      setErrors(validation.errors);
      setStatus("Review the highlighted treatment fields before saving.");
      return;
    }

    try {
      const data = mode === "edit" ? await updateTreatment(treatmentId, validation.normalized) : await createTreatment(validation.normalized);
      navigate(`/treatments/${data.treatment_id}`);
    } catch (error) {
      setStatus(error.response?.data?.message || "Unable to save treatment.");
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

  async function handleNewTreatment() {
    const data = await getNextTreatmentId();
    const discountDefaults = getTreatmentDiscountDefaultsFromEligibility(selectedPatient?.discount_eligibility);
    setForm(
      buildTreatmentFormState({
        ...emptyTreatment,
        treatment_id: data.treatment_id,
        patient_id: selectedPatient?.patient_id || "",
        treatment_date: todayIsoDate(),
        discount_type: discountDefaults.discount_type,
        discount_percent: discountDefaults.discount_percent,
        amount_paid: ""
      })
    );
    setAttachments([]);
    setErrors({});
    setStatus("");
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

  return (
    <Layout>
      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="page-card space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-clinic-700">Dental Treatment Record</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">{mode === "edit" ? "Update Treatment" : "New Treatment"}</h1>
              <p className="mt-2 text-sm text-slate-600">Select a patient first, then record the treatment details and financial balance clearly.</p>
            </div>
            <div className="no-print flex flex-wrap gap-3">
              <BackButton
                fallbackTo={
                  mode === "edit" && treatmentId
                    ? `/treatments/${treatmentId}`
                    : selectedPatient?.patient_id
                      ? `/patients/${selectedPatient.patient_id}`
                      : "/patients"
                }
              />
              <button type="button" className="button-secondary" onClick={handleNewTreatment}>
                New Treatment
              </button>
              <button type="submit" className="button-primary">
                {mode === "edit" ? "Update Treatment" : "Save Treatment"}
              </button>
              {mode === "edit" && (
                <Link className="button-secondary" to={`/treatments/${treatmentId}`}>
                  Load Treatment
                </Link>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="record-tile min-h-[86px]">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Treatment ID</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{form.treatment_id || "-"}</p>
            </div>
            <div className="record-tile min-h-[86px]">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Selected Patient</p>
              <p className="mt-2 break-words text-sm font-semibold text-slate-900">{selectedPatient?.display_name || "No patient selected yet"}</p>
            </div>
            <div className="record-tile min-h-[86px]">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Patient ID</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{selectedPatient?.patient_id || form.patient_id || "-"}</p>
            </div>
            <div className="record-tile min-h-[86px]">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Patient Classification</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{selectedPatient?.discount_eligibility || "None"}</p>
            </div>
            <div className="status-strip min-h-[86px]">
              <p className="text-xs uppercase tracking-[0.2em] text-clinic-700">Current Balance</p>
              <p className="mt-2 text-xl font-semibold text-clinic-900">{formatPesoAmount(form.balance || 0)}</p>
            </div>
          </div>

          {status && <p className="feedback-message rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{status}</p>}
        </section>

        <Section title="Patient Selector" description="Search and select the patient before adding or updating treatment.">
          <label className="field-box block">
            <span className="label-text">Search Patient</span>
            <input
              className={inputClass(Boolean(errors.patient_id), hasFilledValue(patientQuery))}
              value={patientQuery}
              onChange={(event) => setPatientQuery(event.target.value)}
              placeholder="Search by patient name, patient ID, or mobile number"
            />
            {errors.patient_id && <p className="error-text">{errors.patient_id}</p>}
          </label>

          {patientResults.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Patient</th>
                    <th className="px-4 py-3">Patient ID</th>
                    <th className="px-4 py-3">Mobile Number</th>
                    <th className="px-4 py-3">Select</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {patientResults.map((patient) => (
                    <tr key={patient.patient_id}>
                      <td className="px-4 py-3">{patient.display_name}</td>
                      <td className="px-4 py-3">{patient.patient_id}</td>
                      <td className="px-4 py-3">{patient.mobile_number || "-"}</td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => handleSelectPatient(patient)} className="button-secondary">
                          Select
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedPatient && (
            <div className="mt-4 rounded-2xl border border-clinic-100 bg-clinic-50 p-4 text-sm text-clinic-900">
              <p className="font-semibold">Selected Patient</p>
              <p className="mt-1">{selectedPatient.display_name}</p>
              <p>{selectedPatient.patient_id} | Mobile {selectedPatient.mobile_number || "-"}</p>
              <p>Patient Classification: {selectedPatient.discount_eligibility || "None"}</p>
              {selectedPatient.discount_eligibility === "Senior Citizen and PWD" && (
                <p className="mt-2 text-xs text-amber-700">
                  Patient has both Senior Citizen and PWD eligibility. Apply only one discount basis unless the clinic confirms otherwise.
                </p>
              )}
            </div>
          )}
        </Section>

        <Section title="Treatment Entry Form" description="Record treatment details, follow-up information, and payment details in clearly separated sections.">
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
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

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">Treatment Details</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="field-box">
                  <span className="label-text">Treatment Date *</span>
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
                  <span className="label-text">Procedure *</span>
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
                  <span className="label-text">Dentist/s *</span>
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
                <label className="field-box">
                  <span className="label-text">Remarks</span>
                  <textarea className={areaClass(Boolean(errors.remarks), hasFilledValue(form.remarks))} value={form.remarks || ""} onChange={(event) => handleChange("remarks", event.target.value)} />
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-clinic-100 bg-clinic-50/50 p-4">
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

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">Payment Details</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="field-box">
                  <span className="label-text">Amount Charged *</span>
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
                  <span className="label-text">Amount Paid *</span>
                  <input type="number" step="0.01" min="0" className={inputClass(Boolean(errors.amount_paid), hasFilledValue(form.amount_paid))} value={form.amount_paid || ""} onChange={(event) => handleChange("amount_paid", event.target.value)} />
                  <p className="mt-2 text-xs font-medium text-slate-500">{formatPesoAmount(form.amount_paid || 0)}</p>
                  {errors.amount_paid && <p className="error-text">{errors.amount_paid}</p>}
                </label>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="field-box md:col-span-1">
                  <span className="label-text">Balance *</span>
                  <input className={inputClass(Boolean(errors.balance), hasFilledValue(form.balance))} readOnly value={form.balance || ""} />
                  <p className="mt-2 text-sm font-semibold text-clinic-900">{formatPesoAmount(form.balance || 0)}</p>
                  {errors.balance && <p className="error-text">{errors.balance}</p>}
                </label>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Treatment History for Selected Patient" description="Only treatments under the selected patient are listed here.">
          <TreatmentHistoryTable treatments={history} />
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
      </form>
    </Layout>
  );
}
