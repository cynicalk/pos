/*
 * 067_orders_requested_bill_at
 *
 * "Customer requested the bill" was previously an ephemeral WebSocket broadcast
 * (BILL_REQUESTED) with nothing persisted. The ETA engine uses this as a strong
 * signal that a table is about to free (it collapses the remaining estimate to
 * roughly the wrap-up buffer), and table_sessions records when it happened.
 *
 * Stamp it on the order rows so it survives reloads and can be read back per
 * dining session. It's set on every active order of the table at request time;
 * the session aggregator takes the earliest stamp across the session.
 */
exports.up = (pgm) => {
  pgm.addColumn('orders', {
    requested_bill_at: { type: 'timestamptz', notNull: false, default: null },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('orders', 'requested_bill_at');
};
