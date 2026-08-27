/**
 * Expiry evaluators for the rules engine — the licence and staff-certificate
 * halves of Phase 5. Kept out of engine.js only because that file was already
 * long; they are part of the same catalogue.
 *
 * Both work off the compliance snapshot's already-computed `daysToExpiry`, so
 * the rule and the compliance page can never disagree about how long is left.
 */

const { evaluateCondition, interpolate } = require('./engine');

/**
 * ISO date for the alert text.
 *
 * Must go through toISOString: a DATE column comes back from pg as a JS Date,
 * and String(date).slice(0, 10) yields "Wed Sep 16" — the start of the JS
 * toString, not a date anyone can read back or sort. Caught on live output.
 */
function isoDate(d) {
  if (!d) return 'unknown';
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? String(d).slice(0, 10) : date.toISOString().slice(0, 10);
}

/**
 * FSSAI licence nearing or past expiry.
 *
 * A licence with no expiry date on file is deliberately NOT alerted on here —
 * `daysToExpiry` is null and there is nothing to compare. The compliance page
 * reports that as 'unknown', which is a different problem needing a different
 * fix ("record the date") than a licence that is genuinely running out.
 */
function evaluateLicenceExpiry(rules, { licence }) {
  const applicable = rules.filter((r) => r.rule_type === 'license_expiry');
  if (!applicable.length || !licence?.onFile || licence.daysToExpiry === null) return [];

  const candidates = [];
  for (const rule of applicable) {
    if (!evaluateCondition(licence.daysToExpiry, rule.condition)) continue;

    const expired = licence.daysToExpiry < 0;
    candidates.push({
      ruleId: rule.id,
      ruleType: rule.rule_type,
      // Keyed to the expiry date, so renewing it retires the alert and a later
      // renewal that also runs short raises a fresh one.
      dedupeKey: `license_expiry:${isoDate(licence.validUntil)}`,
      title: expired
        ? `FSSAI licence expired ${Math.abs(licence.daysToExpiry)} days ago`
        : `FSSAI licence expires in ${licence.daysToExpiry} days`,
      // An expired record does NOT go through the template. The template is
      // written in the future tense ("expires in {days} days"), which for a
      // lapsed licence rendered as "expires in -26 days" — a negative countdown
      // nobody can act on. Past tense is written out directly instead.
      description: expired
        ? `FSSAI licence ${licence.number || 'on file'} expired on `
          + `${isoDate(licence.validUntil)}, ${Math.abs(licence.daysToExpiry)} days ago. `
          + 'Trading without a valid licence is the risk here, not the renewal cost.'
        : interpolate(rule.message_template, {
          number: licence.number || 'on file',
          days_to_expiry: licence.daysToExpiry,
          expiry_date: isoDate(licence.validUntil),
        }),
      // An expired licence is not the same risk as one running short: trading
      // without a valid licence is the thing that closes a restaurant.
      priority: expired ? 'critical' : rule.severity,
    });
  }
  return candidates;
}

/** Staff certificates nearing or past expiry — one alert per holder and type. */
function evaluateCertExpiry(rules, { certs }) {
  const applicable = rules.filter((r) => r.rule_type === 'cert_expiry');
  if (!applicable.length || !certs?.length) return [];

  const candidates = [];
  for (const rule of applicable) {
    for (const cert of certs) {
      if (cert.daysToExpiry === null) continue;
      if (!evaluateCondition(cert.daysToExpiry, rule.condition)) continue;

      const expired = cert.daysToExpiry < 0;
      const certType = String(cert.certType || 'certificate').replace(/_/g, ' ');

      candidates.push({
        ruleId: rule.id,
        ruleType: rule.rule_type,
        dedupeKey: `cert_expiry:${cert.id}`,
        title: expired
          ? `${cert.holderName}: ${certType} expired`
          : `${cert.holderName}: ${certType} expires in ${cert.daysToExpiry} days`,
        description: expired
          ? `${cert.holderName}'s ${certType} expired on ${isoDate(cert.validUntil)}, `
            + `${Math.abs(cert.daysToExpiry)} days ago.`
          : interpolate(rule.message_template, {
            holder: cert.holderName,
            cert_type: certType,
            days_to_expiry: cert.daysToExpiry,
            expiry_date: isoDate(cert.validUntil),
          }),
        priority: expired ? 'high' : rule.severity,
      });
    }
  }
  return candidates;
}

module.exports = { evaluateLicenceExpiry, evaluateCertExpiry };
