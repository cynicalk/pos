import LandingLayout from "../LandingLayout";
import { Helmet } from "react-helmet-async";
import { SEC, SEC_P, PageCTA } from "../shared";
import { Trash2, ClipboardList, BarChart3, Cloud, Sparkles, FileText, TrendingDown } from "lucide-react";

const SHIFT_DATA = [
  { shift: "Mon",  morning: 310, lunch: 520, evening: 210 },
  { shift: "Tue",  morning: 280, lunch: 490, evening: 195 },
  { shift: "Wed",  morning: 420, lunch: 680, evening: 310 },
  { shift: "Thu",  morning: 190, lunch: 310, evening: 140 },
  { shift: "Fri",  morning: 350, lunch: 590, evening: 280 },
  { shift: "Sat",  morning: 510, lunch: 820, evening: 390 },
  { shift: "Sun",  morning: 460, lunch: 740, evening: 350 },
];
const TOP_ITEMS = [
  { name: "Tomatoes",  val: "₹312", pct: 91 },
  { name: "Paneer",    val: "₹228", pct: 66 },
  { name: "Spinach",   val: "₹156", pct: 45 },
  { name: "Cream",     val: "₹98",  pct: 29 },
];
const MAX_TOTAL = Math.max(...SHIFT_DATA.map(d => d.morning + d.lunch + d.evening));

function WasteDashboardPreview() {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ border: "1px solid var(--line-2)", background: "var(--paper)", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 0 rgba(255,255,255,.6) inset, 0 24px 64px -28px rgba(10,10,10,.18)" }}>
        {/* Titlebar */}
        <div style={{ height: 36, borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 8, padding: "0 14px" }}>
          <div style={{ display: "flex", gap: 5 }}>
            {[0,1,2].map(i => <span key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--line-2)", display: "inline-block" }} />)}
          </div>
          <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 11, color: "var(--mute)", marginLeft: 8 }}>cooklyt.in · Waste dashboard</span>
          <span style={{ marginLeft: "auto", fontFamily: '"Geist Mono", monospace', fontSize: 10, color: "var(--ok)", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", fontWeight: 600 }}>
            <TrendingDown size={10} /> –22% this week
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 130px" }}>
          {/* Chart area */}
          <div style={{ padding: "14px 14px 10px", borderRight: "1px solid var(--line)" }}>
            <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10, color: "var(--mute)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Waste by day (₹)</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100 }}>
              {SHIFT_DATA.map(({ shift, morning, lunch, evening }) => {
                const total = morning + lunch + evening;
                const h = Math.round((total / MAX_TOTAL) * 90);
                const hM = Math.round((morning / total) * h);
                const hL = Math.round((lunch / total) * h);
                const hE = h - hM - hL;
                return (
                  <div key={shift} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 1 }}>
                      <div style={{ height: hM, background: "var(--copper)", opacity: 0.55, borderRadius: "2px 2px 0 0" }} />
                      <div style={{ height: hL, background: "var(--copper)", opacity: 0.8 }} />
                      <div style={{ height: hE, background: "var(--copper)", opacity: 0.35, borderRadius: "0 0 2px 2px" }} />
                    </div>
                    <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 9, color: "var(--mute)" }}>{shift}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              {[["Morning", 0.55], ["Lunch", 0.8], ["Evening", 0.35]].map(([label, op]) => (
                <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--mute)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--copper)", opacity: op, display: "inline-block" }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
          {/* Top wasted */}
          <div style={{ padding: "14px 12px" }}>
            <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10, color: "var(--mute)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Top wasted</div>
            {TOP_ITEMS.map(({ name, val, pct }) => (
              <div key={name} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: "var(--ink-2)" }}>{name}</span>
                  <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 11, fontWeight: 600, color: "var(--ink)" }}>{val}</span>
                </div>
                <div style={{ height: 3, background: "var(--line)", borderRadius: 2 }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "var(--bad)", borderRadius: 2, opacity: 0.65 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Toast */}
      <div className="preview-badge" style={{ position: "absolute", right: -16, bottom: -16, padding: "12px 14px", background: "var(--ink)", color: "var(--accent-on)", borderRadius: 8, boxShadow: "0 14px 30px -10px rgba(10,10,10,.4)", minWidth: 186 }}>
        <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10, letterSpacing: ".12em", opacity: 0.55, textTransform: "uppercase" }}>Waste spike detected</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>Saturday lunch +58%</div>
        <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10.5, color: "rgba(250,250,248,.5)", marginTop: 4 }}>Tomatoes · Paneer</div>
      </div>
    </div>
  );
}

const WASTE_FEATURES = [
  {
    Icon: Trash2,
    title: "Waste tracking that speaks in rupees",
    body: "Log every waste event by ingredient, shift, and reason — which dish, which prep stage, which shift, and exactly how much it cost you.",
    soon: false,
  },
  {
    Icon: ClipboardList,
    title: "Stop ordering by habit",
    body: "See real-time stock levels before you place a single order. CookLyt surfaces what you already have so you stop over-purchasing the same items week after week.",
    soon: false,
  },
  {
    Icon: BarChart3,
    title: "Recipe-linked cost impact",
    body: "Every ingredient is tied to your recipes and purchase prices. The waste dashboard shows kilograms and rupees together — so the cost of every discard is impossible to ignore.",
    soon: false,
  },
  {
    Icon: Cloud,
    title: "Waste root-cause analysis",
    body: "Rain on Thursday? Your pasta waste spikes 180%. CookLyt correlates waste with weather, day of week, and shift to surface the patterns costing you money — and what to prep less of.",
    soon: true,
  },
  {
    Icon: Sparkles,
    title: "AI-powered demand forecasting",
    body: "Predict tomorrow's covers, auto-calculate ingredient needs from your recipe BOMs, and generate a smart reorder list — before you over-buy. Works from just 7 days of data.",
    soon: true,
  },
  {
    Icon: FileText,
    title: "Invoice scanner + live margin alerts",
    body: "Photograph a supplier invoice. CookLyt extracts every line item and instantly recalculates food-cost % across affected recipes — alerting you the moment a dish crosses your margin threshold.",
    soon: true,
  },
];

export default function Waste() {
  return (
    <LandingLayout>
      <Helmet>
        <title>Waste Intelligence — CookLyt</title>
        <meta name="description" content="See exactly what's being wasted, by shift and by ingredient, with cost attached — so you can fix it before it eats your margins." />
        <meta property="og:title" content="Know what your kitchen wastes, in rupees" />
        <meta property="og:description" content="See exactly what's being wasted, by shift and by ingredient, with cost attached — so you can fix it before it eats your margins." />
        <meta property="og:image" content="https://cooklyt.in/og/waste.png" />
      </Helmet>
      {/* ── Hero ── */}
      <section style={{ padding: "80px 0 64px", borderBottom: "1px solid var(--line)" }}>
        <div className="lp-container" style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 64, alignItems: "center" }} className="page-hero-grid">
            <div>
              <span style={SEC}>Waste intelligence</span>
              <h1 style={{ fontSize: "clamp(36px, 6vw, 72px)", letterSpacing: "-.03em", lineHeight: 1.0, fontWeight: 600, margin: "12px 0 20px", maxWidth: 800 }}>
                Every tool built around one goal: less waste, more margin.
              </h1>
              <p style={{ ...SEC_P, fontSize: 17, maxWidth: 480 }}>
                Most systems treat waste as a month-end report. CookLyt treats it as a live number you can act on mid-shift.
              </p>
            </div>
            <div className="page-hero-preview" style={{ paddingBottom: 32, paddingRight: 32 }}>
              <WasteDashboardPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ── Quote ── */}
      <div style={{ borderBottom: "1px solid var(--line)", padding: "56px 0", background: "var(--paper)" }}>
        <div className="lp-container" style={{ maxWidth: 860, margin: "0 auto" }}>
          <blockquote style={{ fontSize: "clamp(20px, 3vw, 32px)", lineHeight: 1.3, letterSpacing: "-.018em", fontWeight: 600, color: "var(--ink)", margin: 0 }}>
            Most POS systems tell you what you sold.{" "}
            <span style={{ color: "var(--mute-2)" }}>CookLyt tells you</span>{" "}
            <em style={{ fontStyle: "italic", fontWeight: 500 }}>what you shouldn't have bought.</em>
          </blockquote>
        </div>
      </div>

      {/* ── Feature grid ── */}
      <section style={{ borderTop: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }} className="features-grid">
            {WASTE_FEATURES.map(({ Icon, title, body, soon }, i) => (
              <div key={title} style={{ padding: "32px 28px 36px", borderRight: (i + 1) % 3 !== 0 ? "1px solid var(--line)" : 0, borderBottom: "1px solid var(--line)", minHeight: 200 }}>
                <span style={{ display: "inline-grid", placeItems: "center", width: 28, height: 28, color: "var(--ink)", marginBottom: 14 }}>
                  <Icon size={22} strokeWidth={1.4} />
                </span>
                <h3 style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-.005em", margin: "0 0 8px" }}>{title}</h3>
                <p style={{ color: "var(--mute)", margin: "0 0 16px", fontSize: 13.5, lineHeight: 1.6 }}>{body}</p>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: '"Geist Mono", monospace', fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", padding: "4px 9px", borderRadius: 999, border: "1px solid var(--line-2)", color: soon ? "var(--mute)" : "var(--ink-2)" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: soon ? "var(--warn)" : "var(--ok)" }} />
                  {soon ? "Coming soon" : "Live now"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PageCTA />

      <style>{`
        @media (max-width: 980px) {
          .page-hero-grid    { grid-template-columns: 1fr !important; gap: 48px !important; }
          .page-hero-preview { padding-right: 32px !important; }
        }
        /* hero preview now stays visible on phones — badge shrunk in LandingLayout */
        @media (max-width: 860px) {
          .features-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .features-grid > div:nth-child(odd)  { border-right: 1px solid var(--line) !important; }
          .features-grid > div:nth-child(even) { border-right: 0 !important; }
        }
        @media (max-width: 520px) {
          .features-grid { grid-template-columns: 1fr !important; }
          .features-grid > div { border-right: 0 !important; }
        }
      `}</style>
    </LandingLayout>
  );
}
