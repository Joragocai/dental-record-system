-- Workload-specific indexes; the unique public IDs already have indexes.

CREATE INDEX idx_patients_name
  ON public.patients(last_name, first_name, middle_name);

CREATE INDEX idx_patients_registered
  ON public.patients(date_registered DESC, id DESC);

CREATE INDEX idx_treatments_patient_date
  ON public.treatments(patient_id, treatment_date DESC, id DESC);

CREATE INDEX idx_treatments_next_appointment
  ON public.treatments(next_appointment_date)
  WHERE next_appointment_date IS NOT NULL;

CREATE INDEX idx_appointments_patient_date
  ON public.appointments(patient_id, appointment_date DESC, id DESC);

CREATE INDEX idx_appointments_schedule
  ON public.appointments(appointment_date, appointment_time, id);

CREATE INDEX idx_attachments_patient
  ON public.attachments(patient_id, uploaded_at DESC);

CREATE INDEX idx_attachments_treatment
  ON public.attachments(treatment_id, uploaded_at DESC)
  WHERE treatment_id IS NOT NULL;
