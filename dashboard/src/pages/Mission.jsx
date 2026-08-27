import LandingLayout from "../LandingLayout";
import { Helmet } from "react-helmet-async";
import { SEC, PageCTA } from "../shared";
import { AlertTriangle, Package } from "lucide-react";

const STOCK_ITEMS = [
  { name: "Tomatoes",     qty: "2.4 kg",  threshold: "3 kg",  status: "low",    expiry: "1d",  cost: "₹168/kg" },
  { name: "Paneer",       qty: "0.6 kg",  threshold: "1 kg",  status: "low",    expiry: "2d",  cost: "₹340/kg" },
  { name: "Olive oil",    qty: "1.1 L",   threshold: "0.5 L", status: "ok",     expiry: "6mo", cost: "₹420/L" },
  { name: "Cooking cream",qty: "3 packs", threshold: "2 pk",  status: "ok",     expiry: "5d",  cost: "₹60/pk" },
  { name: "Coriander",    qty: "0.1 kg",  threshold: "0.2 kg",status: "critical",expiry: "1d", cost: "₹80/kg" },
  { name: "Basmati rice", qty: "4.5 kg",  threshold: "2 kg",  status: "ok",     expiry: "—",   cost: "₹95/kg" },
];

function InventoryPreview() {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ border: "1px solid var(--line-2)", background: "var(--paper)", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 0 rgba(255,255,255,.6) inset, 0 24px 64px -28px rgba(10,10,10,.18)" }}>
        {/* Titlebar */}
        <div style={{ height: 36, borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 8, padding: "0 14px" }}>
          <div style={{ display: "flex", gap: 5 }}>
            {[0,1,2].map(i => <span key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--line-2)", display: "inline-block" }} />)}
          </div>
          <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 11, color: "var(--mute)", marginLeft: 8 }}>cooklyt.in · Inventory</span>
          <span style={{ marginLeft: "auto", fontFamily: '"Geist Mono", monospace', fontSize: 10, color: "var(--bad)", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", fontWeight: 600 }}>
            <AlertTriangle size={10} /> 2 items critical
          </span>
        </div>
        {/* Column headers */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 64px 44px 56px", gap: 8, padding: "7px 14px", borderBottom: "1px solid var(--line)", fontFamily: '"Geist Mono", monospace', fontSize: 10, color: "var(--mute)", textTransform: "uppercase", letterSpacing: ".08em" }}>
          <span>Item</span><span style={{ textAlign: "right" }}>Stock</span><span style={{ textAlign: "center" }}>Exp</span><span style={{ textAlign: "right" }}>Unit cost</span>
        </div>
        {/* Rows */}
        {STOCK_ITEMS.map(({ name, qty, status, expiry, cost }, i) => {
          const bg = status === "critical" ? "rgba(234,67,53,0.05)" : status === "low" ? "rgba(251,188,4,0.05)" : "transparent";
          const dotColor = status === "critical" ? "var(--bad)" : status === "low" ? "var(--warn)" : "var(--ok)";
          return (
            <div key={name} style={{ display: "grid", gridTemplateColumns: "1fr 64px 44px 56px", gap: 8, padding: "9px 14px", borderBottom: i < STOCK_ITEMS.length - 1 ? "1px solid var(--line)" : 0, alignItems: "center", background: bg }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: status !== "ok" ? 500 : 400 }}>{name}</span>
              </span>
              <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 11.5, fontWeight: 600, color: status === "critical" ? "var(--bad)" : status === "low" ? "var(--warn)" : "var(--ink)", textAlign: "right" }}>{qty}</span>
              <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10.5, color: expiry === "1d" ? "var(--bad)" : "var(--mute)", textAlign: "center" }}>{expiry}</span>
              <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10.5, color: "var(--mute)", textAlign: "right" }}>{cost}</span>
            </div>
          );
        })}
        {/* Footer */}
        <div style={{ padding: "9px 14px", borderTop: "1px solid var(--line)", background: "var(--paper-2)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10, color: "var(--mute)" }}>6 items tracked</span>
          <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10, color: "var(--mute)", display: "flex", alignItems: "center", gap: 5 }}>
            <Package size={9} /> Next reorder: Tomatoes, Coriander
          </span>
        </div>
      </div>
      {/* Toast */}
      <div className="preview-badge" style={{ position: "absolute", right: -16, bottom: -16, padding: "12px 14px", background: "var(--ink)", color: "var(--accent-on)", borderRadius: 8, boxShadow: "0 14px 30px -10px rgba(10,10,10,.4)", minWidth: 180 }}>
        <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10, letterSpacing: ".12em", opacity: 0.55, textTransform: "uppercase" }}>Expiry alert</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>Coriander expires tomorrow</div>
        <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10.5, color: "rgba(250,250,248,.5)", marginTop: 4 }}>0.1 kg · ₹8 at risk</div>
      </div>
    </div>
  );
}

const STATS = [
  { num: "78–80M", unit: "t",    desc: "Food wasted annually across India — one of the highest totals globally.", src: "UNEP Food Waste Index Report, 2024" },
  { num: "₹1.53", unit: "L cr",  desc: "India's annual economic loss from food waste.", src: "NABCONS / MoFPI, 2022" },
  { num: "~19 cr", unit: "",     desc: "Indians who remain undernourished, while urban restaurants discard excess inventory.", src: "UNEP, 2024" },
];

export default function Mission() {
  return (
    <LandingLayout>
      <Helmet>
        <title>Our Mission — CookLyt</title>
        <meta name="description" content="CookLyt exists to make food waste visible and fixable for every Indian restaurant — starting with real-time inventory awareness." />
        <meta property="og:title" content="Why we built CookLyt" />
        <meta property="og:description" content="CookLyt exists to make food waste visible and fixable for every Indian restaurant — starting with real-time inventory awareness." />
        <meta property="og:image" content="https://cooklyt.in/og/mission.png" />
      </Helmet>
      {/* ── Hero ── */}
      <section style={{ padding: "80px 0 64px", borderBottom: "1px solid var(--line)" }}>
        <div className="lp-container" style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 64, alignItems: "center" }} className="page-hero-grid">
            <div>
              <span style={SEC}>Why we built CookLyt</span>
              <h1 style={{ fontSize: "clamp(36px, 6vw, 72px)", letterSpacing: "-.03em", lineHeight: 1.0, fontWeight: 600, margin: "12px 0 20px", maxWidth: 800 }}>
                India wastes food that could feed 377 million people. Most of it starts in a restaurant fridge.
              </h1>
            </div>
            <div className="page-hero-preview" style={{ paddingBottom: 32, paddingRight: 32 }}>
              <InventoryPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats strip ── */}
      <div style={{ borderBottom: "1px solid var(--line)", background: "var(--paper-2)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }} className="mission-stats">
          {STATS.map(({ num, unit, desc, src }, i) => (
            <div key={i} style={{ padding: "40px 28px", borderRight: i < 2 ? "1px solid var(--line)" : 0 }}>
              <div className="mono" style={{ fontSize: 40, fontWeight: 500, letterSpacing: "-.02em", lineHeight: 1 }}>
                {num}{unit && <span style={{ fontSize: 16, letterSpacing: 0, color: "var(--mute)", marginLeft: 4 }}>{unit}</span>}
              </div>
              <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55, marginTop: 10 }}>{desc}</div>
              <div className="mono" style={{ fontSize: 10.5, color: "var(--mute-2)", marginTop: 10, lineHeight: 1.4 }}>{src}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Story ── */}
      <section style={{ padding: "80px 0", borderTop: "1px solid var(--line)" }}>
        <div className="lp-container" style={{ maxWidth: 760, margin: "0 auto" }}>
          <p style={{ fontSize: 16, color: "var(--ink-2)", lineHeight: 1.8, marginBottom: 20 }}>
            India's food-service sector generates{" "}
            <strong style={{ color: "var(--ink)" }}>11.9 million tonnes of food waste every year</strong>.
            And most of it doesn't happen at the dinner table — it happens in the back of a restaurant,
            on an overloaded shelf, in a fridge nobody checked before placing the morning order.
          </p>
          <span style={{ display: "block", fontFamily: '"Geist Mono", monospace', fontSize: 11, color: "var(--mute-2)", marginBottom: 32, lineHeight: 1.5 }}>
            Source: UNEP Food Waste Index Report 2021 — unep.org
          </span>

          <div style={{ margin: "0 0 32px", padding: "22px 26px", background: "var(--paper-2)", border: "1px solid var(--line)", borderLeft: "3px solid var(--copper)", borderRadius: "0 10px 10px 0" }}>
            <p style={{ fontSize: 15.5, color: "var(--ink-2)", margin: 0, lineHeight: 1.7 }}>
              While urban restaurants discard excess inventory from overstocking,{" "}
              <strong style={{ color: "var(--ink)" }}>~19 crore Indians remain undernourished</strong>. India
              wastes enough food annually — valued at{" "}
              <strong style={{ color: "var(--ink)" }}>₹1.53 lakh crore</strong> — equivalent to 2.35% of
              national GDP.
            </p>
            <span style={{ display: "block", fontFamily: '"Geist Mono", monospace', fontSize: 11, color: "var(--mute-2)", marginTop: 10, lineHeight: 1.5 }}>
              Sources: NABCONS / MoFPI 2022 (economic loss); UNEP Food Waste Index 2024 (undernourishment)
            </span>
          </div>

          <p style={{ fontSize: 16, color: "var(--ink-2)", lineHeight: 1.8, marginBottom: 20 }}>
            We built CookLyt because the problem isn't that restaurant owners don't care. It's that
            they've never had a system that makes waste{" "}
            <strong style={{ color: "var(--ink)" }}>visible, measurable, and preventable</strong> — in real
            time, in rupees, per shift.
          </p>

          <p style={{ fontSize: 16, color: "var(--ink-2)", lineHeight: 1.8 }}>
            CookLyt is a POS system that runs every part of service and watches every rupee of waste —
            so restaurant owners can see, for the first time, exactly what they're discarding and exactly
            what it costs. That's the system we built. That's the problem we're solving.
          </p>
        </div>
      </section>

      {/* ── About us ── */}
      <section style={{ borderTop: "1px solid var(--line)", background: "var(--paper-2)", padding: "64px 0" }}>
        <div className="lp-container" style={{ maxWidth: 760, margin: "0 auto" }}>
          <span style={SEC}>About us</span>
          <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", letterSpacing: "-.022em", lineHeight: 1.15, fontWeight: 600, margin: "10px 0 16px" }}>
            Built by people who've worked in kitchens and in software.
          </h2>
          <p style={{ color: "var(--mute)", fontSize: 15, lineHeight: 1.7, maxWidth: 580 }}>
            We're a Bengaluru-based product team. CookLyt is our first product — built specifically
            for the Indian food-service market, with waste intelligence at its core from day one.
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
        @media (max-width: 860px) {
          .mission-stats { grid-template-columns: 1fr !important; }
          .mission-stats > div { border-right: 0 !important; border-bottom: 1px solid var(--line) !important; }
          .mission-stats > div:last-child { border-bottom: 0 !important; }
        }
      `}</style>
    </LandingLayout>
  );
}
