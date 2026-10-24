-- Keep completed/cancelled/no-show visits in the appointment history when
-- a treatment's next follow-up date changes. Never reactivate old visits.
CREATE OR REPLACE FUNCTION public.sync_treatment_followup() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE previous RECORD;
DECLARE new_date DATE;
DECLARE new_time TEXT;
BEGIN
  new_date := NEW.next_appointment_date;
  new_time := NULLIF(NEW.next_appointment_time, '');
  SELECT id,status,appointment_date,appointment_time
    INTO previous FROM public.appointments
    WHERE origin_treatment_id=NEW.treatment_id FOR UPDATE;

  IF new_date IS NULL THEN
    IF previous.id IS NOT NULL THEN
      -- A removed planned follow-up is cancelled. Release the active link so
      -- any later scheduling creates a distinct visit, preserving history.
      IF previous.status='Scheduled' THEN
        UPDATE public.appointments SET status='Cancelled',updated_at=NOW()
          WHERE id=previous.id;
      END IF;
      UPDATE public.appointments SET origin_treatment_id=NULL WHERE id=previous.id;
    END IF;
    RETURN NEW;
  END IF;

  IF previous.id IS NULL THEN
    INSERT INTO public.appointments
      (patient_id,appointment_date,appointment_time,planned_procedure,notes,status,origin_treatment_id)
    VALUES
      (NEW.patient_id,new_date,new_time,
       'Follow-up: '||NEW.procedure,'Linked to treatment '||NEW.treatment_id,
       'Scheduled',NEW.treatment_id);
  ELSIF previous.appointment_date IS DISTINCT FROM new_date OR
        previous.appointment_time IS DISTINCT FROM new_time THEN
    IF previous.status='Scheduled' THEN
      UPDATE public.appointments
        SET appointment_date=new_date,appointment_time=new_time,
            planned_procedure='Follow-up: '||NEW.procedure,updated_at=NOW()
        WHERE id=previous.id;
    ELSE
      UPDATE public.appointments SET origin_treatment_id=NULL WHERE id=previous.id;
      INSERT INTO public.appointments
        (patient_id,appointment_date,appointment_time,planned_procedure,notes,status,origin_treatment_id)
      VALUES
        (NEW.patient_id,new_date,new_time,'Follow-up: '||NEW.procedure,
         'Linked to treatment '||NEW.treatment_id,'Scheduled',NEW.treatment_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Avoid a circular trigger: when an appointment date changes, update the
-- treatment's display fields but do not cause a second treatment-to-appointment sync.
CREATE OR REPLACE FUNCTION public.sync_followup_appointment_date() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.origin_treatment_id IS NOT NULL AND
    (NEW.appointment_date IS DISTINCT FROM OLD.appointment_date OR
     NEW.appointment_time IS DISTINCT FROM OLD.appointment_time) THEN
    UPDATE public.treatments SET
      next_appointment_date=NEW.appointment_date,
      next_appointment=NEW.appointment_date::text,
      next_appointment_time=NEW.appointment_time,
      updated_at=NOW()
    WHERE treatment_id=NEW.origin_treatment_id;
  END IF;
  RETURN NEW;
END;
$$;
