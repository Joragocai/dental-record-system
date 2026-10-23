// Sequence values are reserved, so uncommitted form previews must not call this function.
// Allocate within the same transaction as the corresponding INSERT.
export async function allocatePublicId(client, prefix, year) {
  if (!["P", "T"].includes(prefix)) throw new Error("Invalid public ID prefix.");
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new Error("Invalid public ID year.");
  const { rows } = await client.query(
    `INSERT INTO public.public_id_counters(prefix, sequence_year, last_value)
     VALUES ($1, $2, 1)
     ON CONFLICT(prefix, sequence_year) DO UPDATE
       SET last_value = public.public_id_counters.last_value + 1
       WHERE public.public_id_counters.last_value < 9999
     RETURNING last_value`,
    [prefix, year]
  );
  if (!rows.length) throw new Error("Annual public ID limit of 9999 reached.");
  const sequence = Number(rows[0].last_value);
  return `${prefix}-${year}-${String(sequence).padStart(4, "0")}`;
}

// Preview never reserves a number; the submitted create must obtain the final ID
// inside its write transaction. This prevents collisions when multiple tabs are open.
export async function previewPublicId(client, prefix, year) {
  if (!["P", "T"].includes(prefix) || !Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new Error("Invalid public ID request.");
  }
  const { rows } = await client.query(
    "SELECT last_value FROM public.public_id_counters WHERE prefix=$1 AND sequence_year=$2",
    [prefix, year]
  );
  const next = Number(rows[0]?.last_value || 0) + 1;
  if (next > 9999) throw new Error("Annual public ID limit of 9999 reached.");
  return `${prefix}-${year}-${String(next).padStart(4, "0")}`;
}
