import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import AttachmentGallery from "../components/AttachmentGallery";
import AttachmentUploadForm from "../components/AttachmentUploadForm";
import BackButton from "../components/BackButton";
import Layout from "../components/Layout";
import TreatmentHistoryTable from "../components/TreatmentHistoryTable";
import { emptyTreatment, suggestedTreatmentProcedures } from "../lib/forms";
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
import { validateTreatmentForm } from "../lib/validation";

function inputClass(hasError) {
  return hasError ? "text-input input-error" : "text-input";
}

function areaClass(hasError) {
  return hasError ? "text-area input-error" : "text-area";
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
          setForm({ ...data, balance: Number(data.balance || 0).toFixed(2) });
          const patient = await getPatient(data.patient_id);
          setSelectedPatient(patient);
        })
        .catch(() => setStatus("Unable to load treatment."));
      getTreatmentAttachments(treatmentId).then(setAttachments).catch(() => setAttachments([]));
      return;
    }

    getNextTreatmentId()
      .then((data) => setForm((current) => ({ ...current, treatment_id: data.treatment_id })))
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
    setForm((current) => ({ ...current, patient_id: selectedPatient.patient_id }));
    getTreatmentsByPatient(selectedPatient.patient_id).then(setHistory).catch(() => setHistory([]));
  }, [selectedPatient]);

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
      const charged = name === "amount_charged" ? value : current.amount_charged;
      const paid = name === "amount_paid" ? value : current.amount_paid;
      const amountCharged = charged === "" ? Number.NaN : Number(charged);
      const amountPaid = paid === "" ? Number.NaN : Number(paid);
      next.balance = Number.isNaN(amountCharged) || Number.isNaN(amountPaid) ? "" : (amountCharged - amountPaid).toFixed(2);
      return next;
    });
    setErrors((current) => {
      const next = { ...current };
      delete next[name];
      if (name === "amount_charged" || name === "amount_paid") delete next.balance;
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
    setForm({ ...emptyTreatment, treatment_id: data.treatment_id, patient_id: selectedPatient?.patient_id || "", balance: "" });
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

          <div className="record-grid">
            <div className="record-tile">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Treatment ID</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{form.treatment_id || "-"}</p>
            </div>
            <div className="record-tile">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Selected Patient</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{selectedPatient?.display_name || "No patient selected yet"}</p>
            </div>
            <div className="record-tile">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Patient ID</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{selectedPatient?.patient_id || form.patient_id || "-"}</p>
            </div>
            <div className="status-strip">
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
              className={inputClass(Boolean(errors.patient_id))}
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
            </div>
          )}
        </Section>

        <Section title="Treatment Entry Form" description="Record treatment details, payment information, and remarks.">
          <div className="form-grid">
            <label className="field-box">
              <span className="label-text">Treatment ID</span>
              <input className="text-input" readOnly value={form.treatment_id} />
              {errors.treatment_id && <p className="error-text">{errors.treatment_id}</p>}
            </label>
            <label className="field-box">
              <span className="label-text">Patient ID</span>
              <input className="text-input" readOnly value={selectedPatient?.patient_id || form.patient_id} />
            </label>
            <label className="field-box">
              <span className="label-text">Patient Name</span>
              <input className="text-input" readOnly value={selectedPatient?.display_name || ""} />
            </label>
            <label className="field-box">
              <span className="label-text">Date *</span>
              <input type="date" className={inputClass(Boolean(errors.treatment_date))} value={form.treatment_date || ""} onChange={(event) => handleChange("treatment_date", event.target.value)} />
              {errors.treatment_date && <p className="error-text">{errors.treatment_date}</p>}
            </label>
            <label className="field-box">
              <span className="label-text">Tooth No./s</span>
              <input className={inputClass(Boolean(errors.tooth_numbers))} value={form.tooth_numbers || ""} onChange={(event) => handleChange("tooth_numbers", event.target.value)} />
            </label>
            <label className="field-box">
              <span className="label-text">Next Appointment</span>
              <input type="date" className={inputClass(Boolean(errors.next_appointment))} value={form.next_appointment || ""} onChange={(event) => handleChange("next_appointment", event.target.value)} />
              {errors.next_appointment && <p className="error-text">{errors.next_appointment}</p>}
            </label>
            <label className="field-box">
              <span className="label-text">Procedure *</span>
              <div className="datalist-input-wrap">
                <input
                  className={`${inputClass(Boolean(errors.procedure))} pr-10`}
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
              <input className={inputClass(Boolean(errors.dentists))} value={form.dentists || ""} onChange={(event) => handleChange("dentists", event.target.value)} />
              {errors.dentists && <p className="error-text">{errors.dentists}</p>}
            </label>
            <label className="field-box">
              <span className="label-text">Amount Charged *</span>
              <input type="number" step="0.01" min="0" className={inputClass(Boolean(errors.amount_charged))} value={form.amount_charged || ""} onChange={(event) => handleChange("amount_charged", event.target.value)} />
              <p className="mt-2 text-xs font-medium text-slate-500">{formatPesoAmount(form.amount_charged || 0)}</p>
              {errors.amount_charged && <p className="error-text">{errors.amount_charged}</p>}
            </label>
            <label className="field-box">
              <span className="label-text">Amount Paid *</span>
              <input type="number" step="0.01" min="0" className={inputClass(Boolean(errors.amount_paid))} value={form.amount_paid || ""} onChange={(event) => handleChange("amount_paid", event.target.value)} />
              <p className="mt-2 text-xs font-medium text-slate-500">{formatPesoAmount(form.amount_paid || 0)}</p>
              {errors.amount_paid && <p className="error-text">{errors.amount_paid}</p>}
            </label>
            <label className="field-box">
              <span className="label-text">Balance *</span>
              <input className={inputClass(Boolean(errors.balance))} readOnly value={form.balance || ""} />
              <p className="mt-2 text-xs font-medium text-slate-500">{formatPesoAmount(form.balance || 0)}</p>
              {errors.balance && <p className="error-text">{errors.balance}</p>}
            </label>
            <label className="field-box md:col-span-2 xl:col-span-3">
              <span className="label-text">Remarks</span>
              <textarea className={areaClass(Boolean(errors.remarks))} value={form.remarks || ""} onChange={(event) => handleChange("remarks", event.target.value)} />
            </label>
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
