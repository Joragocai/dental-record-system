import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import BackButton from "../components/BackButton";
import Layout from "../components/Layout";
import { createPatientAppointment, getAppointment, getPatient, updateAppointment } from "../lib/api";
import { appointmentStatusOptions, emptyAppointment, suggestedTreatmentProcedures } from "../lib/forms";
import { validateAppointmentForm } from "../lib/validation";

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

export default function AppointmentFormPage({ mode = "create" }) {
  const { patientId, appointmentId } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState(null);
  const [form, setForm] = useState({
    ...emptyAppointment,
    appointment_date: new Date().toISOString().slice(0, 10)
  });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("");

  useEffect(() => {
    getPatient(patientId).then(setPatient).catch(() => setPatient(null));
  }, [patientId]);

  useEffect(() => {
    if (mode !== "edit" || !appointmentId) return;

    getAppointment(appointmentId)
      .then((appointment) =>
        setForm({
          ...emptyAppointment,
          ...appointment,
          appointment_date: appointment.appointment_date || "",
          appointment_time: appointment.appointment_time || "",
          planned_procedure: appointment.planned_procedure || "",
          notes: appointment.notes || "",
          status: appointment.status || "Scheduled"
        })
      )
      .catch(() => setStatus("Unable to load appointment."));
  }, [appointmentId, mode]);

  function handleChange(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    setStatus("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const validation = validateAppointmentForm(form, patient);
    if (!validation.isValid) {
      setErrors(validation.errors);
      setStatus("Review the highlighted appointment fields before saving.");
      return;
    }

    try {
      if (mode === "edit" && appointmentId) {
        await updateAppointment(appointmentId, validation.normalized);
      } else {
        await createPatientAppointment(patientId, validation.normalized);
      }
      navigate(`/patients/${patientId}`);
    } catch (error) {
      setStatus(error.response?.data?.message || `Unable to ${mode === "edit" ? "update" : "save"} appointment.`);
    }
  }

  return (
    <Layout>
      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="page-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-clinic-700">Patient Appointment</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">{mode === "edit" ? "Edit Appointment" : "Schedule Appointment"}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {mode === "edit"
                  ? "Update the appointment details without changing the patient record history."
                  : "Create a planned visit without creating a completed treatment record."}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <BackButton fallbackTo={patientId ? `/patients/${patientId}` : "/patients"} />
              <button type="submit" className="button-primary">
                {mode === "edit" ? "Update Appointment" : "Save Appointment"}
              </button>
            </div>
          </div>

          {status && <p className="feedback-message mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{status}</p>}
        </section>

        <section className="page-card">
          <div className="record-grid xl:grid-cols-3">
            <div className="record-tile">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Patient</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{patient?.display_name || "Loading patient..."}</p>
            </div>
            <div className="record-tile">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Patient ID</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{patient?.patient_id || patientId}</p>
            </div>
            <div className="record-tile">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Mobile Number</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{patient?.mobile_number || "-"}</p>
            </div>
          </div>
        </section>

        <section className="form-section">
          <div className="form-section-header">
            <h2 className="section-title">Appointment Details</h2>
            <p className="mt-1 text-sm text-slate-600">Choose a common procedure or type a custom planned procedure for the future visit.</p>
          </div>
          <div className="form-section-body">
            <div className="form-grid">
              <label className="field-box">
                <LabelText label="Appointment Date" required />
                <input
                  type="date"
                  className={inputClass(Boolean(errors.appointment_date), hasFilledValue(form.appointment_date))}
                  value={form.appointment_date}
                  onChange={(event) => handleChange("appointment_date", event.target.value)}
                />
                {errors.appointment_date && <p className="error-text">{errors.appointment_date}</p>}
              </label>
              <label className="field-box">
                <span className="label-text">Appointment Time</span>
                <input
                  type="time"
                  className={inputClass(Boolean(errors.appointment_time), hasFilledValue(form.appointment_time))}
                  value={form.appointment_time}
                  onChange={(event) => handleChange("appointment_time", event.target.value)}
                />
                <p className="mt-1 text-xs text-slate-500">Leave time blank if the exact appointment time is not yet final.</p>
                {errors.appointment_time && <p className="error-text">{errors.appointment_time}</p>}
              </label>
              <label className="field-box">
                <span className="label-text">Planned Procedure</span>
                <div className="datalist-input-wrap">
                  <input
                    className={`${inputClass(Boolean(errors.planned_procedure), hasFilledValue(form.planned_procedure))} pr-10`}
                    list="appointment-procedure-options"
                    value={form.planned_procedure}
                    onChange={(event) => handleChange("planned_procedure", event.target.value)}
                    placeholder="Choose or type planned procedure"
                  />
                  <span className="datalist-input-arrow" aria-hidden="true">
                    ▾
                  </span>
                </div>
                <datalist id="appointment-procedure-options">
                  {suggestedTreatmentProcedures.map((procedure) => (
                    <option key={procedure} value={procedure} />
                  ))}
                </datalist>
                <p className="mt-1 text-xs text-slate-500">Select a common procedure or type a custom planned procedure.</p>
              </label>
              <label className="field-box">
                <span className="label-text">Status</span>
                <select className={selectClass(Boolean(errors.status), hasFilledValue(form.status))} value={form.status} onChange={(event) => handleChange("status", event.target.value)}>
                  {appointmentStatusOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {errors.status && <p className="error-text">{errors.status}</p>}
              </label>
              <label className="field-box md:col-span-2 xl:col-span-3">
                <span className="label-text">Notes</span>
                <textarea className={areaClass(Boolean(errors.notes), hasFilledValue(form.notes))} value={form.notes} onChange={(event) => handleChange("notes", event.target.value)} />
              </label>
            </div>
          </div>
        </section>
      </form>
    </Layout>
  );
}
