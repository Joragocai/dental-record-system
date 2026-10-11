import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import { createPatientAppointment, getAppointment, getPatient, updateAppointment } from "../lib/api";
import { appointmentStatusOptions, emptyAppointment, suggestedTreatmentProcedures } from "../lib/forms";
import { validateAppointmentForm } from "../lib/validation";
import { useRuntimeStatus } from "../context/RuntimeStatusContext";
import { usePatientUnsavedGuard } from "../lib/usePatientUnsavedGuard";
import { hasUnsavedAppointmentChanges } from "../lib/appointmentFormState";
import { isDashboardScheduleOrigin } from "../lib/dashboardSchedule";

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
  const location = useLocation();
  const fromDashboardSchedule = mode === "edit" && isDashboardScheduleOrigin(location.state);
  const backDestination = fromDashboardSchedule ? "/" : `/patients/${patientId}`;
  const backLabel = fromDashboardSchedule ? "Home" : "Patient Record";
  const { isDemoMode } = useRuntimeStatus();
  const formRef = useRef(null);
  const savingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSucceeded, setSaveSucceeded] = useState(false);
  const [patient, setPatient] = useState(null);
  const [form, setForm] = useState(() => ({
    ...emptyAppointment,
    appointment_date: new Date().toISOString().slice(0, 10)
  }));
  const [baseline, setBaseline] = useState(() => ({
    ...emptyAppointment,
    appointment_date: new Date().toISOString().slice(0, 10)
  }));
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("");

  useEffect(() => {
    getPatient(patientId).then(setPatient).catch(() => setPatient(null));
  }, [patientId]);

  useEffect(() => {
    if (mode !== "edit" || !appointmentId) return;

    getAppointment(appointmentId)
      .then((appointment) => {
        const loaded = {
          ...emptyAppointment,
          ...appointment,
          appointment_date: appointment.appointment_date || "",
          appointment_time: appointment.appointment_time || "",
          planned_procedure: appointment.planned_procedure || "",
          notes: appointment.notes || "",
          status: appointment.status || "Scheduled"
        };
        setForm(loaded);
        setBaseline(loaded);
      })
      .catch(() => setStatus("Unable to load appointment."));
  }, [appointmentId, mode]);

  const hasUnsavedChanges = hasUnsavedAppointmentChanges(form, baseline);
  usePatientUnsavedGuard(hasUnsavedChanges && !isSaving && !saveSucceeded, "appointment");

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
    if (savingRef.current) return;
    const validation = validateAppointmentForm(form, patient);
    if (!validation.isValid) {
      setErrors(validation.errors);
      setStatus("Review the highlighted appointment fields before saving.");
      const firstInvalidName = Object.keys(validation.errors).find((name) => formRef.current?.elements.namedItem(name));
      if (firstInvalidName) {
        window.requestAnimationFrame(() => {
          const field = formRef.current?.elements.namedItem(firstInvalidName);
          if (!field) return;
          field.focus({ preventScroll: true });
          field.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
        });
      }
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    setStatus("");
    try {
      if (mode === "edit" && appointmentId) {
        await updateAppointment(appointmentId, validation.normalized);
      } else {
        await createPatientAppointment(patientId, validation.normalized);
      }
      setSaveSucceeded(true);
      navigate(backDestination, { state: { saveNotice: { kind: mode === "edit" ? "appointment-updated" : "appointment-created" } } });
    } catch (error) {
      setStatus(error.response?.data?.message || `Unable to ${mode === "edit" ? "update" : "save"} appointment.`);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <Layout>
      <form ref={formRef} onSubmit={handleSubmit} noValidate aria-busy={isSaving} className="space-y-6 pb-36 sm:pb-0">
        <div className="no-print -mb-2">
          <Link to={backDestination} aria-label={`Back to ${backLabel}`} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-lg px-2 text-sm font-medium text-clinic-700 transition-colors duration-200 ease-out hover:bg-clinic-50 hover:text-clinic-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clinic-700">
            <span aria-hidden="true">←</span> {backLabel}
          </Link>
        </div>
        <section className="page-card">
          <div>
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-clinic-700">Patient Appointment</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">{mode === "edit" ? "Edit Appointment" : "Schedule Appointment"}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {mode === "edit"
                  ? "Update the appointment details without changing the patient record history."
                  : "Create a planned visit without creating a completed treatment record."}
              </p>
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
                  name="appointment_date"
                  aria-invalid={Boolean(errors.appointment_date)}
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
                  name="appointment_time"
                  aria-invalid={Boolean(errors.appointment_time)}
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
                    name="planned_procedure"
                    aria-invalid={Boolean(errors.planned_procedure)}
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
                <select name="status" aria-invalid={Boolean(errors.status)} className={selectClass(Boolean(errors.status), hasFilledValue(form.status))} value={form.status} onChange={(event) => handleChange("status", event.target.value)}>
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
                <textarea name="notes" aria-invalid={Boolean(errors.notes)} className={areaClass(Boolean(errors.notes), hasFilledValue(form.notes))} value={form.notes} onChange={(event) => handleChange("notes", event.target.value)} />
              </label>
            </div>
            <div className="no-print mt-5 hidden justify-end border-t border-slate-200 pt-5 sm:flex">
              <button type="submit" disabled={isSaving} className="button-primary min-h-[50px] min-w-[200px] text-base font-semibold disabled:cursor-wait disabled:opacity-60">{isSaving ? "Saving..." : mode === "edit" ? "Update Appointment" : "Save Appointment"}</button>
            </div>
          </div>
        </section>
        <div className={`no-print fixed left-0 right-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.07)] backdrop-blur sm:hidden ${isDemoMode ? "bottom-14" : "bottom-0"}`}>
          <button type="submit" disabled={isSaving} className="button-primary min-h-[50px] w-full text-base font-semibold disabled:cursor-wait disabled:opacity-60">{isSaving ? "Saving..." : mode === "edit" ? "Update Appointment" : "Save Appointment"}</button>
        </div>
      </form>
    </Layout>
  );
}
