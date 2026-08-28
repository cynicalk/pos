/**
 * Winback offers — the action half of the churn prediction.
 *
 * The Guests page already predicts which regulars have lapsed past their own
 * visit rhythm. This closes the loop with something the operator can actually
 * hand over: a unique, single-use discount for one lapsed guest, printable as a
 * QR they bring on their next visit.
 *
 * The discount itself is a real `coupons` row (so it validates and applies at the
 * till through the existing coupon engine — nothing new to trust at redemption
 * time). This table records the one thing coupons doesn't: WHICH lapsed guest an
 * offer was issued to, so the winback list can show open vs redeemed per guest
 * and never issues two open offers to the same person. Status and discount are
 * read from the linked coupon — one source of truth, no duplicated lifecycle.
 *
 * No send channel is implied: a winback offer is printed and handed over, exactly
 * as the deck framed it. The messaged version waits on the WhatsApp channel.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE winback_offers (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id       UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      loyalty_customer_id UUID NOT NULL REFERENCES loyalty_customers(id) ON DELETE CASCADE,
      coupon_id           UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
      churn_status        TEXT,
      created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (coupon_id)
    );
    CREATE INDEX idx_winback_restaurant ON winback_offers (restaurant_id);
    CREATE INDEX idx_winback_customer   ON winback_offers (loyalty_customer_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS winback_offers;');
};
