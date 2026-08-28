const journal = require('../src/modules/accounting/journal');

/**
 * The accounting bridge's one non-negotiable is that every voucher balances —
 * an export that fails to balance fails inside the accountant's software, after
 * they have trusted it. These pin the balance under the awkward cases (discount
 * as the plug, collected-more-than-billed) and lock the two serialisers.
 */

const day = (over = {}) => ({
  date: '2026-08-20',
  collections: [{ method: 'cash', amount: 600 }, { method: 'upi', amount: 400 }],
  subtotal: 850, taxAmount: 100, serviceCharge: 30, packagingFee: 20,
  ...over,
});

describe('buildJournal balance', () => {
  test('a plain day balances, with the discount as the plug', () => {
    // billed = 850+100+30+20 = 1000; collected = 1000 → discount 0.
    const { vouchers, totals } = journal.buildJournal([day()]);
    const v = vouchers[0];
    expect(v.balanced).toBe(true);
    expect(v.debit).toBe(v.credit);
    expect(totals.balanced).toBe(true);
    // No discount line when billed equals collected.
    expect(v.lines.some((l) => l.ledger === 'Discounts Allowed')).toBe(false);
  });

  test('collected less than billed books the gap as Discounts Allowed', () => {
    // collected 900 vs billed 1000 → 100 discount.
    const { vouchers } = journal.buildJournal([day({
      collections: [{ method: 'cash', amount: 900 }],
    })]);
    const v = vouchers[0];
    const disc = v.lines.find((l) => l.ledger === 'Discounts Allowed');
    expect(disc.debit).toBe(100);
    expect(v.debit).toBe(v.credit);
  });

  test('collected more than billed rides on the sales credit and still balances', () => {
    // collected 1010 vs billed 1000 → -10 plug → sales credit 850-(-10)=860.
    const { vouchers } = journal.buildJournal([day({
      collections: [{ method: 'cash', amount: 1010 }],
    })]);
    const v = vouchers[0];
    expect(v.lines.some((l) => l.ledger === 'Discounts Allowed')).toBe(false);
    expect(v.lines.find((l) => l.ledger === 'Sales').credit).toBe(860);
    expect(v.debit).toBe(v.credit);
  });

  test('every debit has a tender ledger and every credit an income ledger', () => {
    const { vouchers } = journal.buildJournal([day({
      collections: [{ method: 'cash', amount: 550 }],
    })]);
    const v = vouchers[0];
    expect(v.lines.find((l) => l.ledger === 'Cash').debit).toBe(550);
    expect(v.lines.find((l) => l.ledger === 'Output Tax').credit).toBe(100);
    expect(v.lines.find((l) => l.ledger === 'UPI Collections')).toBeUndefined();
  });

  test('the discount cross-check reports divergence from the POS figure, not hides it', () => {
    // plug discount = 100, but the POS recorded only 80 → cross-check +20.
    const j = journal.buildJournal([day({
      collections: [{ method: 'cash', amount: 900 }], recordedDiscount: 80,
    })]);
    expect(j.discountCrossCheck).toBe(20);
  });

  test('a zero cross-check when the plug matches the recorded discount', () => {
    const j = journal.buildJournal([day({
      collections: [{ method: 'cash', amount: 900 }], recordedDiscount: 100,
    })]);
    expect(j.discountCrossCheck).toBe(0);
  });
});

describe('serialisers', () => {
  const j = journal.buildJournal([day({ collections: [{ method: 'cash', amount: 900 }] })]);

  test('Tally XML signs debits negative and credits positive', () => {
    const xml = journal.toTallyXml(j, { companyName: 'Demo <Co>' });
    expect(xml).toContain('<VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>');
    expect(xml).toContain('<DATE>20260820</DATE>');
    // company name is XML-escaped
    expect(xml).toContain('Demo &lt;Co&gt;');
    // a debit line carries a negative amount and ISDEEMEDPOSITIVE Yes
    expect(xml).toMatch(/<ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>-900\.00<\/AMOUNT>/);
    // a credit line is positive
    expect(xml).toMatch(/<AMOUNT>100\.00<\/AMOUNT>/);
  });

  test('journal CSV has a header and one row per ledger line', () => {
    const csv = journal.toJournalCsv(j);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Date,Voucher Type,Ledger,Debit,Credit,Narration');
    expect(lines.length).toBe(1 + j.vouchers[0].lines.length);
    expect(lines.some((l) => l.startsWith('2026-08-20,Journal,Cash,900.00,,'))).toBe(true);
  });
});
