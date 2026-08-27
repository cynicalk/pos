import LandingLayout from "../LandingLayout";
import { Helmet } from "react-helmet-async";
import { SEC, SEC_H2, PageCTA } from "../shared";
import { Trash2, ArrowDown } from "lucide-react";

const WASTE_ITEMS = [
  { name: "Fresh tomatoes",    qty: "1.2 kg", cost: "₹84",  shift: "Morning", bar: 72, bad: true },
  { name: "Paneer (cubed)",    qty: "0.4 kg", cost: "₹56",  shift: "Morning", bar: 48, bad: false },
  { name: "Spinach leaves",   qty: "0.9 kg", cost: "₹36",  shift: "Lunch",   bar: 31, bad: false },
  { name: "Cooking cream",    qty: "0.3 L",  cost: "₹42",  shift: "Lunch",   bar: 36, bad: false },
  { name: "Coriander (fresh)",qty: "0.2 kg", cost: "₹12",  shift: "Evening", bar: 10, bad: false },
];

function WasteLogPreview() {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ border: "1px solid var(--line-2)", background: "var(--paper)", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 0 rgba(255,255,255,.6) inset, 0 24px 64px -28px rgba(10,10,10,.18)" }}>
        {/* Titlebar */}
        <div style={{ height: 36, borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 8, padding: "0 14px" }}>
          <div style={{ display: "flex", gap: 5 }}>
            {[0,1,2].map(i => <span key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--line-2)", display: "inline-block" }} />)}
          </div>
          <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 11, color: "var(--mute)", marginLeft: 8 }}>cooklyt.in · Waste log</span>
          <span style={{ marginLeft: "auto", fontFamily: '"Geist Mono", monospace', fontSize: 10, color: "var(--bad)", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", fontWeight: 600 }}>
            <Trash2 size={10} /> ₹230 wasted today
          </span>
        </div>
        {/* Header row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 56px 52px 70px", gap: 8, padding: "8px 16px", borderBottom: "1px solid var(--line)", fontFamily: '"Geist Mono", monospace', fontSize: 10, color: "var(--mute)", textTransform: "uppercase", letterSpacing: ".08em" }}>
          <span>Ingredient</span><span>Qty</span><span style={{ textAlign: "right" }}>Cost</span><span style={{ textAlign: "right" }}>Shift</span>
        </div>
        {/* Rows */}
        {WASTE_ITEMS.map((item, i) => (
          <div key={item.name} style={{ padding: "10px 16px", borderBottom: i < WASTE_ITEMS.length - 1 ? "1px solid var(--line)" : 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 56px 52px 70px", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: item.bad ? "var(--bad)" : "var(--ink)" }}>{item.name}</span>
              <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 11, color: "var(--mute)" }}>{item.qty}</span>
              <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 12, fontWeight: 600, color: item.bad ? "var(--bad)" : "var(--ink)", textAlign: "right" }}>{item.cost}</span>
              <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10, color: "var(--mute)", textAlign: "right" }}>{item.shift}</span>
            </div>
            <div style={{ height: 3, background: "var(--line)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${item.bar}%`, height: "100%", background: item.bad ? "var(--bad)" : "var(--copper)", borderRadius: 2, opacity: 0.7 }} />
            </div>
          </div>
        ))}
        {/* Footer */}
        <div style={{ padding: "10px 16px", borderTop: "1px solid var(--line)", background: "var(--paper-2)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10, color: "var(--mute)" }}>Today · 5 items logged</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: '"Geist Mono", monospace', fontSize: 10, color: "var(--ok)", fontWeight: 600 }}>
            <ArrowDown size={10} /> –18% vs last week
          </span>
        </div>
      </div>
      {/* Toast */}
      <div className="preview-badge" style={{ position: "absolute", right: -16, bottom: -16, padding: "12px 14px", background: "var(--ink)", color: "var(--accent-on)", borderRadius: 8, boxShadow: "0 14px 30px -10px rgba(10,10,10,.4)", minWidth: 180 }}>
        <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10, letterSpacing: ".12em", opacity: 0.55, textTransform: "uppercase" }}>Cost alert</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>Tomatoes · ₹84 discarded</div>
        <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10.5, color: "rgba(250,250,248,.5)", marginTop: 4 }}>Morning shift · just now</div>
      </div>
    </div>
  );
}

const STATS = [
  { num: "78–80M", unit: "t",    desc: "Food wasted annually across India — households, food service, and retail combined.", src: "UNEP Food Waste Index Report, 2024" },
  { num: "₹1.53", unit: "L cr",  desc: "India's total annual economic loss from food waste — equivalent to 2.35% of national GDP.", src: "NABCONS / Ministry of Food Processing Industries, 2022" },
  { num: "28",    unit: "%",     desc: "Of all global food waste originates from the food-service sector — more than retail.", src: "UNEP Food Waste Index Report, 2024" },
];

export default function Problem() {
  return (
    <LandingLayout>
      <Helmet>
        <title>The Problem — CookLyt</title>
        <meta name="description" content="Indian cafés quietly discard 6–12% of every purchase as waste. CookLyt makes that waste visible in real time, by station and by shift." />
        <meta property="og:title" content="Your kitchen is bleeding ₹3–6 lakh a year" />
        <meta property="og:description" content="See exactly where food and money disappear — in real time, by station and by shift." />
        <meta property="og:image" content="https://cooklyt.in/og/problem.png" />
      </Helmet>
      {/* ── Hero ── */}
      <section style={{ padding: "80px 0 64px", borderBottom: "1px solid var(--line)" }}>
        <div className="lp-container" style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 64, alignItems: "center" }} className="page-hero-grid">
            <div>
              <span style={SEC}>The problem</span>
              <h1 style={{ fontSize: "clamp(36px, 6vw, 72px)", letterSpacing: "-.03em", lineHeight: 1.0, fontWeight: 600, margin: "12px 0 20px", maxWidth: 760 }}>
                Your kitchen is bleeding ₹3–6 lakh a year. You just can't see it yet.
              </h1>
              <p style={{ fontSize: 17, lineHeight: 1.6, color: "var(--ink-2)", maxWidth: 480, margin: 0 }}>
                Most Indian kitchens reorder the same quantities every morning — same call, same numbers — without checking what's already in the fridge.
              </p>
            </div>
            <div className="page-hero-preview" style={{ paddingBottom: 32, paddingRight: 32 }}>
              <WasteLogPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ── Body ── */}
      <section style={{ padding: "72px 0" }}>
        <div className="lp-container problem-grid" style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 56, alignItems: "start" }}>
          <div>
            <p style={{ color: "var(--ink-2)", fontSize: 15.5, lineHeight: 1.7, marginBottom: 16, maxWidth: 520 }}>
              Vegetables spoil. Half-used packets get forgotten. Items expire quietly. Cafés running at{" "}
              <strong style={{ color: "var(--ink)" }}>40–45% food cost</strong> quietly discard{" "}
              <strong style={{ color: "var(--ink)" }}>6–12% of every purchase</strong>. On ₹50 lakh annual
              revenue, that's up to <strong style={{ color: "var(--ink)" }}>₹6 lakh in the bin</strong> —
              plate by plate, shelf by shelf.
            </p>
            <span style={{ display: "block", fontFamily: '"Geist Mono", monospace', fontSize: 11, color: "var(--mute-2)", marginBottom: 20, lineHeight: 1.5 }}>
              Source: India food cost benchmarking, Feedo.in (2024)
            </span>
            <p style={{ color: "var(--ink-2)", fontSize: 15.5, lineHeight: 1.7, maxWidth: 520 }}>
              The problem isn't that owners don't care. It's that they've never had a system that makes waste{" "}
              <strong style={{ color: "var(--ink)" }}>visible</strong> — in real time, in rupees, per shift.
              That's exactly what CookLyt does.
            </p>
          </div>

          {/* Data card */}
          <div style={{ border: "1px solid var(--line-2)", borderRadius: 12, background: "var(--paper)", overflow: "hidden" }}>
            <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--line)", fontFamily: '"Geist Mono", monospace', fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--mute)" }}>
              What over-ordering costs you
            </div>
            {[
              { label: "Fruits & vegetables spoiled",               val: "6–15%",     style: { color: "var(--bad)",  fontWeight: 600 } },
              { label: "Fruits & veg lost in transit",              val: "~30%",      style: { color: "var(--warn)", fontWeight: 600 } },
              { label: "FSSAI: food spoilt before eaten",           val: "1 in 3",    style: { color: "var(--bad)",  fontWeight: 600 } },
              { label: "Restaurants' purchase waste rate",          val: "6–12%",     style: { color: "var(--warn)", fontWeight: 600 } },
              { label: "With CookLyt's waste controls",             val: "↓ Sharply", style: { color: "var(--ok)",   fontWeight: 600 } },
            ].map(({ label, val, style }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "15px 22px", borderBottom: "1px solid var(--line)" }}>
                <span style={{ fontSize: 14, color: "var(--ink-2)" }}>{label}</span>
                <span className="mono" style={{ fontSize: 16, whiteSpace: "nowrap", ...style }}>{val}</span>
              </div>
            ))}
            <div style={{ padding: "16px 22px" }}>
              <span style={{ display: "block", fontFamily: '"Geist Mono", monospace', fontSize: 11, color: "var(--mute-2)", lineHeight: 1.5 }}>
                Sources: National Horticulture Board; NABCONS / MoFPI 2022; FSSAI, Govt. of India; Feedo.in 2024.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Scale strip ── */}
      <section style={{ borderTop: "1px solid var(--line)", background: "var(--paper-2)", padding: "72px 0" }}>
        <div className="lp-container" style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ marginBottom: 40, maxWidth: 600 }}>
            <span style={SEC}>The scale</span>
            <h2 style={SEC_H2}>India's food-waste crisis starts in the back of a restaurant.</h2>
          </div>
        </div>
        <div style={{ maxWidth: 1180, margin: "0 auto", borderTop: "1px solid var(--line)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }} className="stat-cells">
            {STATS.map(({ num, unit, desc, src }, i) => (
              <div key={i} style={{ padding: "30px 28px", borderRight: i < 2 ? "1px solid var(--line)" : 0, borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column" }}>
                <div className="mono" style={{ fontSize: 40, fontWeight: 500, letterSpacing: "-.02em", lineHeight: 1, color: "var(--ink)" }}>
                  {num}{unit && <span style={{ fontSize: 16, letterSpacing: 0, color: "var(--mute)", marginLeft: 4 }}>{unit}</span>}
                </div>
                <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55, marginTop: 14, flex: 1 }}>{desc}</div>
                <div className="mono" style={{ fontSize: 10.5, color: "var(--mute-2)", borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 16, lineHeight: 1.5 }}>{src}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PageCTA />

      <style>{`
        .page-hero-grid { }
        @media (max-width: 980px) {
          .page-hero-grid    { grid-template-columns: 1fr !important; gap: 48px !important; }
          .page-hero-preview { padding-right: 32px !important; }
        }
        /* hero preview now stays visible on phones — badge shrunk in LandingLayout */
        @media (max-width: 860px) {
          .problem-grid { grid-template-columns: 1fr !important; gap: 36px !important; }
          .stat-cells   { grid-template-columns: repeat(2, 1fr) !important; }
          .stat-cells > div:nth-child(2) { border-right: 0 !important; }
          .stat-cells > div:nth-child(3) { border-right: 0 !important; }
        }
        @media (max-width: 520px) {
          .stat-cells { grid-template-columns: 1fr !important; }
          .stat-cells > div { border-right: 0 !important; }
        }
      `}</style>
    </LandingLayout>
  );
}
