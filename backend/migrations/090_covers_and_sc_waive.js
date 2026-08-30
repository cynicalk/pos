/**
 * Wave 3 capture points — the two numbers the margin picture was missing.
 *
 * The POS knows revenue and it knows the service charge it applied, but two
 * things it never recorded made whole metrics impossible:
 *
 *   - orders.covers : how many guests a bill was for. Without it, every per-guest
 *     figure (average per cover, items per cover) can only be a per-*order*
 *     approximation. Nullable on purpose — a walk-in or an aggregator order may
 *     have no reliable guest count, and a missing cover count must read as "not
 *     captured", never as zero guests.
 *
 *   - payments.service_charge_waived : that a guest declined the (optional, in
 *     India) service charge. A waived bill already stores service_charge_amount = 0,
 *     but that is indistinguishable from a restaurant that charges none — so the
 *     "SC removed %" leak could not be measured. This flag makes the removal
 *     legible, per outlet and per server.
 *
 * Both are additive and nullable/defaulted, so no existing row or code path
 * changes behaviour until the billing flow starts writing them.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE orders
      ADD COLUMN covers INTEGER
        CONSTRAINT orders_covers_positive CHECK (covers IS NULL OR covers > 0);

    ALTER TABLE payments
      ADD COLUMN service_charge_waived BOOLEAN NOT NULL DEFAULT false;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE orders    DROP COLUMN IF EXISTS covers;
    ALTER TABLE payments  DROP COLUMN IF EXISTS service_charge_waived;
  `);
};
