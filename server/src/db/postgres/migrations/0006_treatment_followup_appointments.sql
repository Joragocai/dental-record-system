-- Link each treatment's follow-up date to an independently trackable appointment.
-- Retain legacy treatment date fields for existing forms, while appointments own status.
ALTER TABLE public.appointments
  ADD COLUMN origin_treatment_id TEXT REFERENCES public.treatments(treatment_id);
CREATE UNIQUE INDEX idx_appointments_origin_treatment
  ON public.appointments(origin_treatment_id)
  WHERE origin_treatment_id IS NOT NULL;

-- Preserve any historical appointment rows as-is. Previously untracked treatment
-- follow-ups become Scheduled appointments without changing existing finances.
INSERT INTO public.appointments
  (patient_id,appointment_date,appointment_time,planned_procedure,notes,status,origin_treatment_id,created_at,updated_at)
SELECT t.patient_id,t.next_appointment_date,NULLIF(t.next_appointment_time,''),
       'Follow-up: ' || t.procedure,'Linked to treatment ' || t.treatment_id,
       'Scheduled',t.treatment_id,t.created_at,NOW()
FROM public.treatments t
WHERE t.next_appointment_date IS NOT NULL
ON CONFLICT (origin_treatment_id) WHERE origin_treatment_id IS NOT NULL DO NOTHING;

-- A future treatment edit must not silently reset an already completed,
-- cancelled or missed appointment. New follow-up dates become a new appointment.
CREATE FUNCTION public.sync_treatment_followup() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE previous RECORD;
BEGIN
  SELECT id,status,appointment_date,appointment_time
    INTO previous FROM public.appointments
    WHERE origin_treatment_id=NEW.treatment_id FOR UPDATE;
  IF NEW.next_appointment_date IS NULL THEN
    IF previous.id IS NOT NULL AND previous.status='Scheduled' THEN
      UPDATE public.appointments SET status='Cancelled',updated_at=NOW() WHERE id=previous.id;
    END IF;
    RETURN NEW;
  END IF;
  IF previous.id IS NULL THEN
    INSERT INTO public.appointments
      (patient_id,appointment_date,appointment_time,planned_procedure,notes,status,origin_treatment_id)
    VALUES
      (NEW.patient_id,NEW.next_appointment_date,NULLIF(NEW.next_appointment_time,''),
       'Follow-up: '||NEW.procedure,'Linked to treatment '||NEW.treatment_id,'Scheduled',NEW.treatment_id);
  ELSIF (previous.appointment_date IS DISTINCT FROM NEW.next_appointment_date OR
         previous.appointment_time IS DISTINCT FROM NULLIF(NEW.next_appointment_time,'')) THEN
    IF previous.status='Scheduled' THEN
      UPDATE public.appointments
        SET appointment_date=NEW.next_appointment_date,
            appointment_time=NULLIF(NEW.next_appointment_time,''),
            planned_procedure='Follow-up: '||NEW.procedure,updated_at=NOW()
        WHERE id=previous.id;
    ELSE
      UPDATE public.appointments SET origin_treatment_id=NULL WHERE id=previous.id;
      INSERT INTO public.appointments
        (patient_id,appointment_date,appointment_time,planned_procedure,notes,status,origin_treatment_id)
      VALUES
        (NEW.patient_id,NEW.next_appointment_date,NULLIF(NEW.next_appointment_time,''),
         'Follow-up: '||NEW.procedure,'Linked to treatment '||NEW.treatment_id,'Scheduled',NEW.treatment_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_sync_treatment_followup
AFTER INSERT OR UPDATE OF next_appointment_date,next_appointment_time ON public.treatments
FOR EACH ROW EXECUTE FUNCTION public.sync_treatment_followup();

-- Appointment form edits are authoritative for the next follow-up date/time.
-- This keeps the original treatment display consistent without changing money.
CREATE FUNCTION public.sync_followup_appointment_date() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.origin_treatment_id IS NOT NULL AND
     (NEW.appointment_date IS DISTINCT FROM OLD.appointment_date OR
      NEW.appointment_time IS DISTINCT FROM OLD.appointment_time) THEN
    UPDATE public.treatments
      SET next_appointment_date=NEW.appointment_date,
          next_appointment=NEW.appointment_date::text,
          next_appointment_time=NEW.appointment_time,
          updated_at=NOW()
      WHERE treatment_id=NEW.origin_treatment_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_sync_followup_appointment_date
AFTER UPDATE OF appointment_date,appointment_time ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.sync_followup_appointment_date();
