exports.up = (pgm) => {
  pgm.addColumns('payments', {
    subtotal:              { type: 'numeric(10,2)' },
    tax_rate:              { type: 'numeric(5,4)' },
    tax_amount:            { type: 'numeric(10,2)' },
    service_charge_rate:   { type: 'numeric(5,4)' },
    service_charge_amount: { type: 'numeric(10,2)' },
    discount_amount:       { type: 'numeric(10,2)', default: 0 },
    total_charged:         { type: 'numeric(10,2)' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('payments', [
    'subtotal', 'tax_rate', 'tax_amount',
    'service_charge_rate', 'service_charge_amount',
    'discount_amount', 'total_charged',
  ]);
};
