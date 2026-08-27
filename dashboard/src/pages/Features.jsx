import LandingLayout from "../LandingLayout";
import { Helmet } from "react-helmet-async";
import { SEC, SEC_P, PageCTA } from "../shared";
import { Grid3X3, UtensilsCrossed, Wifi, BarChart2, Gift, Package } from "lucide-react";

const TABLES = [
  { id: "T01", seats: 2, status: "open",      bill: null,    time: null },
  { id: "T02", seats: 4, status: "occupied",  bill: "₹1,240", time: "34m" },
  { id: "T03", seats: 4, status: "ordering",  bill: "₹580",  time: "12m" },
  { id: "T04", seats: 2, status: "open",      bill: null,    time: null },
  { id: "T05", seats: 6, status: "occupied",  bill: "₹2,860", time: "51m" },
  { id: "T06", seats: 4, status: "open",      bill: null,    time: null },
  { id: "T07", seats: 2, status: "ordering",  bill: "₹320",  time: "6m" },
  { id: "T08", seats: 4, status: "occupied",  bill: "₹1,090", time: "28m" },
  { id: "T09", seats: 2, status: "reserved",  bill: null,    time: "8:30p" },
];
const STATUS_STYLE = {
  open:     { bg: "var(--paper-2)", border: "var(--line)",    dot: "var(--mute-2)", label: "Open" },
  occupied: { bg: "rgba(176,106,59,0.08)", border: "rgba(176,106,59,0.3)", dot: "var(--copper)", label: "Occupied" },
  ordering: { bg: "rgba(52,168,83,0.07)", border: "rgba(52,168,83,0.3)",  dot: "var(--ok)",     label: "Ordering" },
  reserved: { bg: "rgba(66,133,244,0.07)", border: "rgba(66,133,244,0.3)", dot: "var(--info)",   label: "Reserved" },
};

function FloorPlanPreview() {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ border: "1px solid var(--line-2)", background: "var(--paper)", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 0 rgba(255,255,255,.6) inset, 0 24px 64px -28px rgba(10,10,10,.18)" }}>
        {/* Titlebar */}
        <div style={{ height: 36, borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 8, padding: "0 14px" }}>
          <div style={{ display: "flex", gap: 5 }}>
            {[0,1,2].map(i => <span key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--line-2)", display: "inline-block" }} />)}
          </div>
          <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 11, color: "var(--mute)", marginLeft: 8 }}>cooklyt.in · Floor plan</span>
          <span style={{ marginLeft: "auto", fontFamily: '"Geist Mono", monospace', fontSize: 10, color: "var(--mute)", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ok)", display: "inline-block" }} /> Live · 5 of 9 occupied
          </span>
        </div>
        {/* Legend */}
        <div style={{ display: "flex", gap: 14, padding: "8px 14px", borderBottom: "1px solid var(--line)" }}>
          {Object.entries(STATUS_STYLE).map(([key, s]) => (
            <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--mute)" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, display: "inline-block" }} />
              {s.label}
            </span>
          ))}
        </div>
        {/* Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, padding: 12 }}>
          {TABLES.map(({ id, seats, status, bill, time }) => {
            const s = STATUS_STYLE[status];
            return (
              <div key={id} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, padding: "10px 10px 8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <span style={{ fontFamily: '"Geist Mono", monospace', fontWeight: 700, fontSize: 12, color: "var(--ink)" }}>{id}</span>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, marginTop: 2, flexShrink: 0 }} />
                </div>
                <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10, color: "var(--mute)", marginTop: 4 }}>{seats} seats</div>
                {bill && <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 11, fontWeight: 600, color: "var(--ink)", marginTop: 4 }}>{bill}</div>}
                {time && <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10, color: status === "reserved" ? "var(--info)" : "var(--mute)", marginTop: 2 }}>{time}</div>}
              </div>
            );
          })}
        </div>
      </div>
      {/* Toast */}
      <div className="preview-badge" style={{ position: "absolute", right: -16, bottom: -16, padding: "12px 14px", background: "var(--ink)", color: "var(--accent-on)", borderRadius: 8, boxShadow: "0 14px 30px -10px rgba(10,10,10,.4)", minWidth: 180 }}>
        <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10, letterSpacing: ".12em", opacity: 0.55, textTransform: "uppercase" }}>Table updated</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>T05 · Bill printed</div>
        <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10.5, color: "rgba(250,250,248,.5)", marginTop: 4 }}>₹2,860 · 6 guests</div>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    Icon: Grid3X3,
    title: "Tables & floor",
    body: "Your floor, always in sync. No confusion about what's open, what's occupied, or what's been ordered.",
    detail: "Drag-and-drop floor plan editor. Covers tracking and seat counts per table. Instant status updates pushed live to every device on the floor — no refresh, no lag.",
  },
  {
    Icon: UtensilsCrossed,
    title: "Menu & kitchen",
    body: "Make a change — it's live everywhere before you look up.",
    detail: "Edit items, prices, modifiers, and availability from any device. Changes reflect instantly on the KDS. Category-level availability lets you 86 an item for the night in two taps.",
  },
  {
    Icon: Wifi,
    title: "Real-time sync",
    body: "Orders don't wait for a connection. When signal drops, CookLyt queues and catches up silently.",
    detail: "Offline-first architecture means service continues uninterrupted. The moment connectivity returns, all queued actions sync in order — no duplicate orders, no lost tickets.",
  },
  {
    Icon: Gift,
    title: "Loyalty & coupons",
    body: "Give regulars a reason to return. Give first-timers a reason to come back.",
    detail: "Points-based loyalty with configurable earn and burn rates. One-time and recurring coupon codes. Track redemption, expiry, and the revenue each campaign drives.",
  },
  {
    Icon: BarChart2,
    title: "Reports & shifts",
    body: "Close the day knowing exactly where every rupee went.",
    detail: "Shift-level P&L, per-item sales breakdown, staff performance, and payment-method splits. Export to CSV or view inline. Designed to answer the questions you actually ask at 11pm.",
  },
  {
    Icon: Package,
    title: "Inventory & costing",
    body: "Know your margins before service, not after.",
    detail: "Recipe-linked ingredient tracking. Every sale auto-deducts from stock. Real-time cost-of-goods calculation means you always know your true margin — before you run out, not after.",
  },
];

export default function Features() {
  return (
    <LandingLayout>
      <Helmet>
        <title>Features — CookLyt</title>
        <meta name="description" content="Tables, orders, KDS, recipes, inventory, loyalty and waste tracking — one POS that runs every part of service." />
        <meta property="og:title" content="One POS. Every part of service." />
        <meta property="og:description" content="Tables, orders, KDS, recipes, inventory, loyalty and waste tracking — one POS that runs every part of service." />
        <meta property="og:image" content="https://cooklyt.in/og/features.png" />
      </Helmet>
      {/* ── Hero ── */}
      <section style={{ padding: "80px 0 64px", borderBottom: "1px solid var(--line)" }}>
        <div className="lp-container" style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 64, alignItems: "center" }} className="page-hero-grid">
            <div>
              <span style={SEC}>The product</span>
              <h1 style={{ fontSize: "clamp(36px, 6vw, 72px)", letterSpacing: "-.03em", lineHeight: 1.0, fontWeight: 600, margin: "12px 0 20px", maxWidth: 760 }}>
                Everything included. Nothing extra.
              </h1>
              <p style={{ ...SEC_P, fontSize: 17, maxWidth: 480 }}>
                Every demo is the full product. No feature limits, no upgrade prompts, no per-station pricing surprises.
              </p>
            </div>
            <div className="page-hero-preview" style={{ paddingBottom: 32, paddingRight: 32 }}>
              <FloorPlanPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature grid ── */}
      <section style={{ borderTop: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }} className="features-grid">
            {FEATURES.map(({ Icon, title, body, detail }, i) => (
              <div key={title} style={{ padding: "32px 28px 36px", borderRight: (i + 1) % 3 !== 0 ? "1px solid var(--line)" : 0, borderBottom: "1px solid var(--line)", minHeight: 220 }}>
                <span style={{ display: "inline-grid", placeItems: "center", width: 28, height: 28, color: "var(--ink)", marginBottom: 14 }}>
                  <Icon size={22} strokeWidth={1.4} />
                </span>
                <h3 style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-.005em", margin: "0 0 6px" }}>{title}</h3>
                <p style={{ color: "var(--ink-2)", margin: "0 0 12px", fontSize: 14, lineHeight: 1.55, fontWeight: 500 }}>{body}</p>
                <p style={{ color: "var(--mute)", margin: 0, fontSize: 13, lineHeight: 1.6 }}>{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing note ── */}
      <section style={{ borderTop: "1px solid var(--line)", background: "var(--paper-2)", padding: "64px 0" }}>
        <div className="lp-container" style={{ maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
          <span style={SEC}>Pricing</span>
          <h2 style={{ fontSize: "clamp(26px, 3.5vw, 40px)", letterSpacing: "-.025em", lineHeight: 1.1, fontWeight: 600, margin: "10px 0 16px" }}>
            Simple, transparent pricing.
          </h2>
          <p style={{ color: "var(--mute)", fontSize: 15, maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.6 }}>
            No per-station fees. No feature tiers. No surprise add-ons. Reach out to get pricing for your restaurant.
          </p>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 32, padding: "24px 36px", border: "1px solid var(--line-2)", borderRadius: 12, background: "var(--paper)", flexWrap: "wrap", justifyContent: "center" }}>
            {["Unlimited stations", "All features included", "Waste intelligence suite", "Dedicated onboarding"].map(item => (
              <span key={item} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--ink-2)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ok)", flexShrink: 0 }} />
                {item}
              </span>
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
