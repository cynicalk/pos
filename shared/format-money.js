/**
 * The one place a money figure becomes a string.
 *
 * There were three copies of `symbol + toFixed(decimals)` — the dashboard's
 * CurrencyContext, the printed receipt, and the guest menu app — and none of
 * them grouped digits. A settlement of three lakh seventy-three thousand
 * rupees rendered as `₹373104.00`, which nobody can read at a glance and which
 * is trivially misread by a factor of ten. Three copies also meant the receipt
 * could disagree with the screen it was printed from.
 *
 * Grouping is locale-driven and the locale is per currency, in
 * settings-options.json. `en-IN` gives South Asian lakh grouping — ₹3,73,104.00,
 * not ₹373,104.00 — for INR, PKR, NPR, LKR and BDT; everything else groups in
 * threes. Both are `en-*` on purpose: they guarantee Latin digits. A locale like
 * `bn-BD` would be more correct about the country and would render ১,২,৩ on a
 * POS whose entire staff reads Latin numerals.
 *
 * The symbol stays the app's own (`A$`, `C$`, `NZ$`, `Rs`) rather than the one
 * `Intl` would pick from a currency code, so this changes grouping and nothing
 * else. Only the number goes through Intl.
 */

/** Cached per locale+decimals — constructing Intl.NumberFormat is not cheap. */
const cache = new Map();

function formatter(locale, decimals) {
  const key = `${locale}:${decimals}`;
  let f = cache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale || 'en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    } catch {
      // An unknown locale must not take a payment screen down with it.
      f = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    }
    cache.set(key, f);
  }
  return f;
}

/**
 * Format an amount against a currency row from settings-options.json.
 *
 * Semantics for a missing value are deliberately unchanged from the three
 * formatters this replaces: null, undefined and '' render as a zero. Hundreds
 * of call sites — most of them on payment and receipt paths — rely on an absent
 * optional line (no discount applied, no service charge) printing as a zero
 * rather than as a dash, and a total that reads "—" mid-payment is worse than
 * one that reads zero. Where a missing figure genuinely means "we could not
 * establish this", call formatMoneyOrDash instead and mean it.
 */
export function formatMoney(amount, currency) {
  const decimals = currency?.decimals ?? 2;
  const symbol = currency?.symbol ?? '';
  const n = parseFloat(amount);
  return `${symbol}${formatter(currency?.locale, decimals).format(Number.isFinite(n) ? n : 0)}`;
}

/**
 * The same, but a figure nobody could establish stays visibly unknown.
 *
 * A real zero still prints as a zero — it is only null, undefined and '' that
 * become a dash, because those are the values that mean "no answer", and
 * rendering them as ₹0.00 sorts "we cannot say" alongside "nothing at stake".
 */
export function formatMoneyOrDash(amount, currency) {
  if (amount === null || amount === undefined || amount === '') return '—';
  const n = parseFloat(amount);
  if (!Number.isFinite(n)) return '—';
  return formatMoney(n, currency);
}
