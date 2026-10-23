// Additive migration: never invent individual payment events for historical totals.
export function ensurePaymentLedger(database) {
  database.exec("SAVEPOINT payment_schema");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS treatment_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        treatment_id TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK (amount_cents <> 0),
        payment_date TEXT,
        payment_method TEXT NOT NULL DEFAULT 'Not recorded',
        reference TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL CHECK (source IN ('opening','initial','recorded','reversal')),
        reverses_payment_id INTEGER UNIQUE,
        request_id TEXT UNIQUE,
        created_at TEXT NOT NULL,
        FOREIGN KEY (treatment_id) REFERENCES treatments(treatment_id),
        FOREIGN KEY (reverses_payment_id) REFERENCES treatment_payments(id),
        CHECK ((source = 'reversal' AND amount_cents < 0 AND reverses_payment_id IS NOT NULL)
            OR (source <> 'reversal' AND amount_cents > 0 AND reverses_payment_id IS NULL))
      );
      CREATE INDEX IF NOT EXISTS idx_treatment_payments_treatment
        ON treatment_payments(treatment_id, id);
    `);

    // An opening amount is an aggregate only; its payment date/method are unknown.
    database.exec(`
      INSERT INTO treatment_payments
        (treatment_id, amount_cents, payment_date, payment_method, reference, notes,
         source, reverses_payment_id, request_id, created_at)
      SELECT t.treatment_id, CAST(ROUND(t.amount_paid * 100) AS INTEGER),
             NULL, 'Not recorded', '',
             'Opening balance migrated from the original treatment. Earlier individual payment details are unavailable.',
             'opening', NULL, NULL, t.created_at
      FROM treatments t
      WHERE CAST(ROUND(COALESCE(t.amount_paid, 0) * 100) AS INTEGER) > 0
        AND NOT EXISTS (
          SELECT 1 FROM treatment_payments p WHERE p.treatment_id = t.treatment_id
        );
    `);
    database.exec("RELEASE SAVEPOINT payment_schema");
  } catch (error) {
    database.exec("ROLLBACK TO SAVEPOINT payment_schema");
    database.exec("RELEASE SAVEPOINT payment_schema");
    throw error;
  }
}
