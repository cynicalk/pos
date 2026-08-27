import LandingLayout from "../LandingLayout";
import { Helmet } from "react-helmet-async";
import { SEC, PageCTA } from "../shared";
import { Check, X, Zap } from "lucide-react";

const SCORE_ROWS = [
  { cap: "Waste tracking",        generic: false, cooklyt: true  },
  { cap: "Recipe-linked costing", generic: false, cooklyt: true  },
  { cap: "Real-time stock view",  generic: false, cooklyt: true  },
  { cap: "KDS integration",       generic: true,  cooklyt: true  },
  { cap: "Offline-first POS",     generic: false, cooklyt: true  },
  { cap: "AI demand forecast",    generic: false, cooklyt: true, soon: true  },
  { cap: "Margin alerts",         generic: false, cooklyt: true, soon: true  },
];

function ScoreCardPreview() {
  const genericScore = SCORE_ROWS.filter(r => r.generic).length;
  const cooklytScore = SCORE_ROWS.filter(r => r.cooklyt).length;
  return (
    <div style={{ position: "relative" }}>
      <div style={{ border: "1px solid var(--line-2)", background: "var(--paper)", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 0 rgba(255,255,255,.6) inset, 0 24px 64px -28px rgba(10,10,10,.18)" }}>
        {/* Titlebar */}
        <div style={{ height: 36, borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 8, padding: "0 14px" }}>
          <div style={{ display: "flex", gap: 5 }}>
            {[0,1,2].map(i => <span key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--line-2)", display: "inline-block" }} />)}
          </div>
          <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 11, color: "var(--mute)", marginLeft: 8 }}>cooklyt.in · Compare</span>
        </div>
        {/* Score header */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px", borderBottom: "1px solid var(--line)", background: "var(--paper-2)" }}>
          <div style={{ padding: "10px 16px", fontFamily: '"Geist Mono", monospace', fontSize: 10, color: "var(--mute)", textTransform: "uppercase", letterSpacing: ".08em" }}>Capability</div>
          <div style={{ padding: "10px 0", textAlign: "center", borderLeft: "1px solid var(--line)" }}>
            <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10, color: "var(--mute)", textTransform: "uppercase", letterSpacing: ".08em" }}>Generic</div>
            <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 20, fontWeight: 700, color: "var(--mute-2)", lineHeight: 1.2, marginTop: 2 }}>{genericScore}/{SCORE_ROWS.length}</div>
          </div>
          <div style={{ padding: "10px 0", textAlign: "center", borderLeft: "1px solid var(--line)", background: "rgba(176,106,59,0.06)" }}>
            <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10, color: "var(--copper)", textTransform: "uppercase", letterSpacing: ".08em" }}>CookLyt</div>
            <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 20, fontWeight: 700, color: "var(--copper)", lineHeight: 1.2, marginTop: 2 }}>{cooklytScore}/{SCORE_ROWS.length}</div>
          </div>
        </div>
        {/* Rows */}
        {SCORE_ROWS.map(({ cap, generic, cooklyt, soon }, i) => (
          <div key={cap} style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px", borderBottom: i < SCORE_ROWS.length - 1 ? "1px solid var(--line)" : 0 }}>
            <div style={{ padding: "9px 16px", fontSize: 12, color: "var(--ink-2)", display: "flex", alignItems: "center", gap: 6 }}>
              {cap}
              {soon && <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 9, color: "var(--mute)", border: "1px solid var(--line-2)", borderRadius: 3, padding: "1px 5px" }}>soon</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", borderLeft: "1px solid var(--line)" }}>
              {generic
                ? <Check size={13} style={{ color: "var(--mute-2)" }} />
                : <X size={13} style={{ color: "var(--line-2)" }} />
              }
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", borderLeft: "1px solid var(--line)", background: "rgba(176,106,59,0.04)" }}>
              <Check size={13} style={{ color: "var(--copper)" }} />
            </div>
          </div>
        ))}
      </div>
      {/* Toast */}
      <div className="preview-badge" style={{ position: "absolute", right: -16, bottom: -16, padding: "12px 14px", background: "var(--ink)", color: "var(--accent-on)", borderRadius: 8, boxShadow: "0 14px 30px -10px rgba(10,10,10,.4)", minWidth: 180 }}>
        <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10, letterSpacing: ".12em", opacity: 0.55, textTransform: "uppercase" }}>Built different</div>
        <div style={{ fontSize: 13, marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}><Zap size={12} style={{ color: "var(--copper)" }} />Waste control built-in</div>
        <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10.5, color: "rgba(250,250,248,.5)", marginTop: 4 }}>Not an add-on. The core.</div>
      </div>
    </div>
  );
}

const CMP_ROWS = [
  { cap: "Waste logging by ingredient & shift",  generic: "Not available",  cooklyt: "Full breakdown",       soon: false },
  { cap: "Waste cost in rupees (not just kg)",   generic: "Not available",  cooklyt: "Recipe-linked",        soon: false },
  { cap: "Inventory check before ordering",      generic: "Manual only",    cooklyt: "Real-time stock view", soon: false },
  { cap: "Weather-correlated waste analysis",    generic: "Not available",  cooklyt: "AI-driven",            soon: true  },
  { cap: "AI demand forecasting",               generic: "Not available",  cooklyt: "Zero-shot",            soon: true  },
  { cap: "Live margin alerts on price change",   generic: "Not available",  cooklyt: "Invoice-triggered",    soon: true  },
  { cap: "Billing, floor & kitchen management",  generic: "Standard",       cooklyt: "Full POS suite",       soon: false, genericHas: true },
];

export default function Compare() {
  return (
    <LandingLayout>
      <Helmet>
        <title>How We Compare — CookLyt</title>
        <meta name="description" content="See how CookLyt stacks up against generic POS systems on waste tracking, recipe-linked costing, and offline-first reliability." />
        <meta property="og:title" content="CookLyt vs. generic POS" />
        <meta property="og:description" content="See how CookLyt stacks up against generic POS systems on waste tracking, recipe-linked costing, and offline-first reliability." />
        <meta property="og:image" content="https://cooklyt.in/og/compare.png" />
      </Helmet>
      {/* ── Hero ── */}
      <section style={{ padding: "80px 0 64px", borderBottom: "1px solid var(--line)" }}>
        <div className="lp-container" style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 64, alignItems: "center" }} className="page-hero-grid">
            <div>
              <span style={SEC}>How we compare</span>
              <h1 style={{ fontSize: "clamp(36px, 6vw, 72px)", letterSpacing: "-.03em", lineHeight: 1.0, fontWeight: 600, margin: "12px 0 20px", maxWidth: 760 }}>
                Waste control isn't an add-on here. It's the entire point.
              </h1>
              <p style={{ color: "var(--mute)", fontSize: 17, maxWidth: 480, margin: 0, lineHeight: 1.55 }}>
                Generic POS systems were built to record transactions. CookLyt was built to reduce food cost — billing is just how it pays for itself.
              </p>
            </div>
            <div className="page-hero-preview" style={{ paddingBottom: 32, paddingRight: 32 }}>
              <ScoreCardPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ── Table ── */}
      <section style={{ padding: "64px 0", borderTop: "1px solid var(--line)" }}>
        <div className="lp-container" style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }} className="cmp-wrap">
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
                <thead>
                  <tr>
                    {["Capability", "Generic POS", "CookLyt"].map((h, i) => (
                      <th key={h} style={{ textAlign: "left", padding: "16px 22px", fontFamily: '"Geist Mono", monospace', fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: i === 2 ? "var(--copper)" : "var(--mute)", background: "var(--paper-2)", borderBottom: "1px solid var(--line)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CMP_ROWS.map(({ cap, generic, cooklyt, soon, genericHas }) => (
                    <tr key={cap}>
                      <td style={{ padding: "15px 22px", fontSize: 14, borderBottom: "1px solid var(--line)", color: "var(--ink)", fontWeight: 500, verticalAlign: "middle" }}>{cap}</td>
                      <td style={{ padding: "15px 22px", fontSize: 14, borderBottom: "1px solid var(--line)", color: genericHas ? "var(--ink)" : "var(--mute-2)", verticalAlign: "middle" }}>
                        {genericHas
                          ? <><span style={{ display: "inline-flex", verticalAlign: "-2px", marginRight: 8, color: "var(--mute-2)" }}><Check size={14} /></span>{generic}</>
                          : <><span style={{ display: "inline-flex", verticalAlign: "-2px", marginRight: 8, color: "var(--mute-2)" }}><X size={14} /></span>{generic}</>
                        }
                      </td>
                      <td style={{ padding: "15px 22px", fontSize: 14, borderBottom: "1px solid var(--line)", color: "var(--ink)", background: "rgba(176,106,59,0.06)", verticalAlign: "middle" }}>
                        <span style={{ display: "inline-flex", verticalAlign: "-2px", marginRight: 8, color: "var(--copper)" }}><Check size={14} /></span>
                        {cooklyt}
                        {soon && <span className="mono" style={{ fontSize: 10, color: "var(--mute)", marginLeft: 6 }}>soon</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ── Callout ── */}
      <section style={{ borderTop: "1px solid var(--line)", background: "var(--paper-2)", padding: "64px 0" }}>
        <div className="lp-container" style={{ maxWidth: 860, margin: "0 auto" }}>
          <blockquote style={{ fontSize: "clamp(20px, 2.8vw, 30px)", lineHeight: 1.35, letterSpacing: "-.018em", fontWeight: 600, color: "var(--ink)", margin: 0, borderLeft: "3px solid var(--copper)", paddingLeft: 24 }}>
            "Coming soon" on this table isn't a roadmap promise. It's features in active development — shipping to all customers when they're ready.
          </blockquote>
          <p style={{ color: "var(--mute)", fontSize: 13.5, marginTop: 20, lineHeight: 1.6 }}>
            Every restaurant that requests a demo gets early access to beta features. The best feedback comes from real service.
          </p>
        </div>
      </section>

      <PageCTA />

      <style>{`
        @media (max-width: 980px) {
          .page-hero-grid    { grid-template-columns: 1fr !important; gap: 48px !important; }
          .page-hero-preview { padding-right: 32px !important; }
        }
        /* hero preview now stays visible on phones — badge shrunk in LandingLayout */
        @media (max-width: 520px) {
          .cmp-wrap th, .cmp-wrap td { padding: 12px 14px !important; font-size: 13px !important; }
        }
      `}</style>
    </LandingLayout>
  );
}
