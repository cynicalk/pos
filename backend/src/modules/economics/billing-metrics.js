/**
 * Per-cover and service-charge-removed metrics (Wave 3).
 *
 * Both ride on capture the billing flow only just started recording, so both
 * lead with coverage: an average per cover computed over the bills that carry a
 * guest count says how many bills that was, and a service-charge-removed rate
 * says how many bills it could even apply to. A figure without its coverage
 * would read a half-captured service as the whole one.
 */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Average per cover — spend per guest, over the bills where a guest count was
 * entered. Abstains (null) until at least one bill carries covers; the caller
 * still has AOV (per order) from the economics totals for everything else.
 *
 * @param row { revenue, covers, coveredOrders, diningOrders }
 */
function buildApc(row = {}) {
  const revenue = Number(row.revenue) || 0;          // revenue of covered bills only
  const covers = Number(row.covers) || 0;
  const coveredOrders = Number(row.coveredOrders) || 0;
  const diningOrders = Number(row.diningOrders) || 0;

  return {
    apc: covers > 0 ? round2(revenue / covers) : null,
    covers,
    coveredOrders,
    diningOrders,
    // What share of dining bills carried a guest count — the honesty rail.
    coveragePct: diningOrders > 0 ? round2((coveredOrders / diningOrders) * 100) : null,
  };
}

/**
 * Service-charge-removed rate — of the dining bills where a service charge was
 * in play (charged or deliberately waived), the share the guest declined, and an
 * estimate of the rupees that walked out with it.
 *
 * @param totals   { applicable, waived, waivedSubtotal }
 * @param byServer [{ server, applicable, waived }]
 * @param opts     { scRate }  configured service-charge fraction, for the ₹ estimate
 */
function buildScRemoved(totals = {}, byServer = [], { scRate = 0 } = {}) {
  const applicable = Number(totals.applicable) || 0;
  const waived = Number(totals.waived) || 0;
  const waivedSubtotal = Number(totals.waivedSubtotal) || 0;
  const rate = Number(scRate) || 0;

  const servers = byServer
    .map((s) => {
      const app = Number(s.applicable) || 0;
      const w = Number(s.waived) || 0;
      return {
        server: s.server || 'Unassigned',
        applicable: app,
        waived: w,
        removedPct: app > 0 ? round2((w / app) * 100) : null,
      };
    })
    // Worst offenders first; a server who never had a waivable bill isn't shown.
    .filter((s) => s.applicable > 0)
    .sort((a, b) => (b.removedPct ?? -1) - (a.removedPct ?? -1) || b.waived - a.waived);

  return {
    applicable,
    waived,
    // Null, not 0%, when no dining bill ever carried a service charge to remove.
    removedPct: applicable > 0 ? round2((waived / applicable) * 100) : null,
    // Estimated foregone service charge on the waived bills — subtotal × the rate
    // the outlet would otherwise have charged. An estimate, not a stored figure.
    estimatedForegone: round2(waivedSubtotal * rate),
    servers,
  };
}

module.exports = { buildApc, buildScRemoved };
