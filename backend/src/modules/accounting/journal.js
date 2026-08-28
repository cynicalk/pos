/**
 * Accounting bridge — turn a period's POS sales into double-entry vouchers an
 * accountant can post, and serialise them either as a Tally-importable XML or a
 * plain journal CSV.
 *
 * The one property this must never lose is that every voucher BALANCES. A day's
 * takings are built as:
 *
 *   Dr  Cash / Card / UPI …   (what was actually collected, by tender)
 *   Dr  Discounts Allowed     (the gap between billed and collected)
 *       Cr  Sales             (net taxable value)
 *       Cr  Output Tax        (GST charged)
 *       Cr  Service Charge
 *       Cr  Packaging
 *
 * The discount line is computed as the PLUG — billed income minus what was
 * collected — so the voucher balances by construction no matter how the POS
 * happens to split its discount columns. That is deliberate: an export that
 * silently fails to balance is worse than no export, because it fails inside the
 * accountant's software after they have trusted it. If the plug ever disagrees
 * with the POS's own recorded discount total, the summary says so rather than
 * hiding it.
 *
 * Scope is stated, not implied: this is the SALES day book. Delivery-platform
 * commission is a separate reconciliation (it lives on Payouts / the delivery
 * P&L), and folding it in here would risk double-counting orders that also have
 * a POS payment row. So it is named as out of scope, not quietly omitted.
 */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Ledger names the vouchers post to. Kept as plain strings an operator can
// rename to match their own chart of accounts before importing.
const LEDGER = {
  sales: 'Sales',
  tax: 'Output Tax',
  service: 'Service Charge',
  packaging: 'Packaging Charges',
  discount: 'Discounts Allowed',
};

// POS tender → a Tally cash/bank ledger name.
const METHOD_LEDGER = {
  cash: 'Cash',
  card: 'Card Collections',
  upi: 'UPI Collections',
  online: 'Online Collections',
  wallet: 'Wallet Collections',
  other: 'Other Collections',
};

function methodLedger(method) {
  const key = String(method || 'other').toLowerCase();
  return METHOD_LEDGER[key] || `${key.charAt(0).toUpperCase()}${key.slice(1)} Collections`;
}

/**
 * Build the vouchers for a set of days.
 *
 * @param days [{
 *   date: 'YYYY-MM-DD',
 *   collections: [{ method, amount }],       // what came in, by tender
 *   subtotal, taxAmount, serviceCharge, packagingFee,  // billed income parts
 *   recordedDiscount,                          // the POS's own discount total, for a cross-check
 * }]
 */
function buildJournal(days = []) {
  const vouchers = [];
  let totalDebit = 0;
  let totalCredit = 0;
  let plugVsRecorded = 0;

  for (const day of days) {
    const collections = (day.collections || []).filter((c) => Number(c.amount) > 0);
    const collected = round2(collections.reduce((s, c) => s + Number(c.amount), 0));

    const sales = round2(day.subtotal);
    const tax = round2(day.taxAmount);
    const service = round2(day.serviceCharge);
    const packaging = round2(day.packagingFee);
    const billed = round2(sales + tax + service + packaging);

    // The plug: everything billed that was not collected is a discount given.
    const discount = round2(billed - collected);

    const lines = [];
    for (const c of collections) {
      lines.push({ ledger: methodLedger(c.method), debit: round2(c.amount), credit: 0 });
    }
    // A positive plug is a discount given (Dr). A negative plug — collected more
    // than billed, from rounding or a tip taken as tender — rides on the sales
    // credit instead of inventing a ledger, so `sales - discount` grows the
    // credit by the surplus. Either way the voucher balances.
    if (discount > 0) lines.push({ ledger: LEDGER.discount, debit: discount, credit: 0 });
    const salesCredit = round2(discount < 0 ? sales - discount : sales);

    if (salesCredit !== 0) lines.push({ ledger: LEDGER.sales, debit: 0, credit: salesCredit });
    if (tax !== 0) lines.push({ ledger: LEDGER.tax, debit: 0, credit: tax });
    if (service !== 0) lines.push({ ledger: LEDGER.service, debit: 0, credit: service });
    if (packaging !== 0) lines.push({ ledger: LEDGER.packaging, debit: 0, credit: packaging });

    const debit = round2(lines.reduce((s, l) => s + l.debit, 0));
    const credit = round2(lines.reduce((s, l) => s + l.credit, 0));
    totalDebit = round2(totalDebit + debit);
    totalCredit = round2(totalCredit + credit);
    if (day.recordedDiscount != null) {
      plugVsRecorded = round2(plugVsRecorded + (Math.max(discount, 0) - Number(day.recordedDiscount)));
    }

    vouchers.push({
      date: day.date,
      narration: `POS sales for ${day.date}`,
      lines,
      debit,
      credit,
      balanced: debit === credit,
    });
  }

  return {
    vouchers,
    totals: {
      debit: totalDebit,
      credit: totalCredit,
      balanced: totalDebit === totalCredit,
      days: vouchers.length,
    },
    // Whether the balancing plug matches the POS's own discount figures. Zero is
    // agreement; non-zero is surfaced, never swallowed.
    discountCrossCheck: round2(plugVsRecorded),
  };
}

/* ── Serialisers ─────────────────────────────────────────────────────────── */

const xmlEscape = (s) => String(s ?? '').replace(/[<>&'"]/g, (c) => (
  { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
));

// Tally reads DD-MMM-YYYY on import but stores YYYYMMDD in the voucher date; the
// latter is the reliable one.
const tallyDate = (isoDate) => String(isoDate).replace(/-/g, '');

/**
 * Serialise to Tally XML (Day Book import: one Journal voucher per day).
 *
 * ISDEEMEDPOSITIVE is Yes for a debit, No for a credit, and AMOUNT carries the
 * sign Tally expects: negative for debit, positive for credit.
 */
function toTallyXml(journal, { companyName = 'CookLyt' } = {}) {
  const voucherXml = (v) => {
    const entries = v.lines.map((l) => {
      const isDebit = l.debit > 0;
      const amount = isDebit ? -l.debit : l.credit;
      return [
        '        <ALLLEDGERENTRIES.LIST>',
        `          <LEDGERNAME>${xmlEscape(l.ledger)}</LEDGERNAME>`,
        `          <ISDEEMEDPOSITIVE>${isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>`,
        `          <AMOUNT>${amount.toFixed(2)}</AMOUNT>`,
        '        </ALLLEDGERENTRIES.LIST>',
      ].join('\n');
    }).join('\n');
    return [
      `      <VOUCHER VCHTYPE="Journal" ACTION="Create">`,
      `        <DATE>${tallyDate(v.date)}</DATE>`,
      `        <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>`,
      `        <NARRATION>${xmlEscape(v.narration)}</NARRATION>`,
      entries,
      '      </VOUCHER>',
    ].join('\n');
  };

  const messages = journal.vouchers
    .map((v) => `    <TALLYMESSAGE xmlns:UDF="TallyUDF">\n${voucherXml(v)}\n    </TALLYMESSAGE>`)
    .join('\n');

  return [
    '<ENVELOPE>',
    '  <HEADER>',
    '    <TALLYREQUEST>Import Data</TALLYREQUEST>',
    '  </HEADER>',
    '  <BODY>',
    '    <IMPORTDATA>',
    '      <REQUESTDESC>',
    '        <REPORTNAME>Vouchers</REPORTNAME>',
    `        <STATICVARIABLES><SVCURRENTCOMPANY>${xmlEscape(companyName)}</SVCURRENTCOMPANY></STATICVARIABLES>`,
    '      </REQUESTDESC>',
    '      <REQUESTDATA>',
    messages,
    '      </REQUESTDATA>',
    '    </IMPORTDATA>',
    '  </BODY>',
    '</ENVELOPE>',
  ].join('\n');
}

const csvCell = (s) => {
  const str = String(s ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

/** Serialise to a flat double-entry journal CSV, one ledger line per row. */
function toJournalCsv(journal) {
  const rows = [['Date', 'Voucher Type', 'Ledger', 'Debit', 'Credit', 'Narration']];
  for (const v of journal.vouchers) {
    for (const l of v.lines) {
      rows.push([
        v.date, 'Journal', l.ledger,
        l.debit ? l.debit.toFixed(2) : '',
        l.credit ? l.credit.toFixed(2) : '',
        v.narration,
      ]);
    }
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

module.exports = {
  buildJournal, toTallyXml, toJournalCsv, methodLedger, LEDGER, METHOD_LEDGER,
};
