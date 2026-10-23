-- Atomic public ID allocator for the existing P-YYYY-0001 / T-YYYY-0001 format.
-- Initialization from existing rows supports later controlled data import.
CREATE TABLE public.public_id_counters (
  prefix TEXT NOT NULL CHECK (prefix IN ('P', 'T')),
  sequence_year INTEGER NOT NULL CHECK (sequence_year BETWEEN 2000 AND 9999),
  last_value INTEGER NOT NULL CHECK (last_value BETWEEN 1 AND 9999),
  PRIMARY KEY (prefix, sequence_year)
);
INSERT INTO public.public_id_counters(prefix, sequence_year, last_value)
SELECT LEFT(patient_id, 1), CAST(SUBSTRING(patient_id FROM 3 FOR 4) AS INTEGER),
       MAX(CAST(SUBSTRING(patient_id FROM 8 FOR 4) AS INTEGER))
FROM public.patients
GROUP BY LEFT(patient_id, 1), SUBSTRING(patient_id FROM 3 FOR 4)
ON CONFLICT (prefix, sequence_year) DO UPDATE
SET last_value = GREATEST(public.public_id_counters.last_value, EXCLUDED.last_value);
INSERT INTO public.public_id_counters(prefix, sequence_year, last_value)
SELECT LEFT(treatment_id, 1), CAST(SUBSTRING(treatment_id FROM 3 FOR 4) AS INTEGER),
       MAX(CAST(SUBSTRING(treatment_id FROM 8 FOR 4) AS INTEGER))
FROM public.treatments
GROUP BY LEFT(treatment_id, 1), SUBSTRING(treatment_id FROM 3 FOR 4)
ON CONFLICT (prefix, sequence_year) DO UPDATE
SET last_value = GREATEST(public.public_id_counters.last_value, EXCLUDED.last_value);
