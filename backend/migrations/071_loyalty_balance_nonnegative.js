// CL4: guard the loyalty points balance against oversell at the DB level.
// Redemption is settled inside the payment transaction now (loyalty.service via
// payments.service); this CHECK makes a redeem that would drive the balance
// negative fail the whole payment atomically instead of silently overselling.
//
// Added NOT VALID so the migration can't fail on any pre-existing row; it is
// enforced on every INSERT/UPDATE from now on.

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE loyalty_customers
      ADD CONSTRAINT loyalty_customers_points_balance_nonneg
      CHECK (points_balance >= 0) NOT VALID;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE loyalty_customers
      DROP CONSTRAINT IF EXISTS loyalty_customers_points_balance_nonneg;
  `);
};
