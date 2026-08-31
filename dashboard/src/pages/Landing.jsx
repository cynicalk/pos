import { Helmet } from "react-helmet-async";
import {
  LayoutDashboard, ReceiptText, LayoutGrid, AlignLeft, BarChart2,
  ShoppingCart, Truck, Check, Mail, ArrowRight, Sunrise, Sparkles,
  Trash2, Grid3X3, BarChart3, Package, Bot, TrendingUp, TrendingDown,
  ShieldCheck, Star, Boxes, Store, Percent, Clock, Flame,
} from "lucide-react";
import LandingLayout from "../LandingLayout";
import { DEMO_EMAIL, MAILTO_HREF, LOGO_SVG, WORDMARK_SVG } from "../shared";

// ── Shared mock chrome ──────────────────────────────────────────────────────
// The marketing mockups are hand-built from the same tokens the real app uses,
// so a visitor sees the actual product surfaces, not a stock illustration.

function MockWindow({ title, right, children, minH }) {
  return (
    <div style={{ border: "1px solid var(--line-2)", background: "var(--paper)", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 0 rgba(255,255,255,.6) inset, 0 24px 64px -30px rgba(10,10,10,.22)" }}>
      <div style={{ height: 36, borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 8, padding: "0 14px" }}>
        <div style={{ display: "flex", gap: 5 }}>
          {[0, 1, 2].map((i) => <span key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--line-2)", display: "inline-block" }} />)}
        </div>
        <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 11, color: "var(--mute)", marginLeft: 8 }}>{title}</span>
        {right && (
          <span style={{ marginLeft: "auto", fontFamily: '"Geist Mono", monospace', fontSize: 10, color: "var(--mute)", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ok)", display: "inline-block" }} />
            {right}
          </span>
        )}
      </div>
      <div style={{ minHeight: minH || undefined }}>{children}</div>
    </div>
  );
}

const MONO = '"Geist Mono", monospace';
const LABEL = { fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--mute-2)" };

// ── Hero mockup: the AI Daily Brief (the signature surface) ──────────────────

function BriefMock() {
  const beats = [
    { lead: true, text: "Yesterday took ", fig: "₹48,200", tail: " — up ", fig2: "17.6%", tail2: " on a normal Tuesday." },
    { text: "Top action: rein in ", fig: "WELCOME50", tail: ", giving away 52% on real volume." },
    { text: "Food cost is holding at ", fig: "31.4%", tail: "; peak was ", fig2: "8pm", tail2: "." },
  ];
  return (
    <MockWindow title="cooklyt.in · Overview" right="Live">
      <div style={{ padding: "16px 18px" }}>
        <div style={{ position: "relative", overflow: "hidden", border: "1px solid var(--line)", borderRadius: 12, background: "linear-gradient(135deg, var(--lp-accent-soft) 0%, var(--paper) 60%)", padding: "15px 17px" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "linear-gradient(180deg, var(--lp-accent), transparent)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: 7, background: "color-mix(in srgb, var(--lp-accent) 16%, transparent)" }}>
              <Sunrise size={14} style={{ color: "var(--lp-accent)" }} />
            </span>
            <div style={{ lineHeight: 1.15 }}>
              <div style={{ ...LABEL, letterSpacing: ".14em", color: "var(--label, var(--mute))" }}>Daily brief</div>
              <div style={{ fontSize: 10.5, color: "var(--mute)" }}>Morning read · Tue, 12 Aug</div>
            </div>
            <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5, fontWeight: 600, letterSpacing: ".04em", padding: "3px 8px", borderRadius: 999, background: "color-mix(in srgb, var(--lp-accent) 14%, transparent)", color: "var(--lp-accent-deep)" }}>
              <Sparkles size={9} /> AI NARRATED
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {beats.map((b, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                <span style={{ flexShrink: 0, marginTop: 7, width: 5, height: 5, borderRadius: 999, background: b.lead ? "var(--lp-accent)" : "var(--line-2)" }} />
                <span style={{ fontSize: b.lead ? 13.5 : 12.5, lineHeight: 1.5, fontWeight: b.lead ? 600 : 400, color: b.lead ? "var(--ink)" : "var(--ink-2)" }}>
                  {b.text}<strong style={{ color: "var(--lp-accent-deep)", fontWeight: 700 }}>{b.fig}</strong>{b.tail}
                  {b.fig2 && <strong style={{ color: "var(--ok)", fontWeight: 700 }}>{b.fig2}</strong>}{b.tail2}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 22px", marginTop: 13, paddingTop: 11, borderTop: "1px solid var(--line)" }}>
            {[["Yesterday", "₹48,200 ▲18%"], ["Food cost", "31.4%"], ["Op. margin", "12.1%"], ["Peak", "8pm"]].map(([l, v]) => (
              <div key={l} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={LABEL}>{l}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MockWindow>
  );
}

// ── POS + KDS mockup ─────────────────────────────────────────────────────────

const STATUS_DOT = { preparing: "var(--warn)", ready: "var(--info)", received: "var(--mute-2)", served: "var(--ok)" };
const ELAPSED_STY = { warn: { color: "var(--warn)", fontWeight: 600 }, bad: { color: "var(--bad)", fontWeight: 600 }, mute: { color: "var(--mute)" } };
const ROWS = [
  { key: "T03", label: "T03", status: "preparing", elapsed: "4m", elStyle: "mute", amount: "₹1,040" },
  { key: "T06", label: "T06", status: "ready", elapsed: "12m", elStyle: "warn", amount: "₹2,260" },
  { key: "#042", label: null, status: "received", elapsed: "just now", elStyle: "mute", amount: "₹590", icon: "cart", sub: "Maya K. · #042" },
  { key: "T14", label: "T14", status: "served", elapsed: "22m", elStyle: "bad", amount: "₹710" },
  { key: "dlv", label: null, status: "preparing", elapsed: "8m", elStyle: "mute", amount: "₹490", icon: "delivery", sub: "#DLV-7741", last: true },
];

function PosMock() {
  const COL = "11px repeat(5, 1fr) 11px";
  const rowBase = { display: "grid", gridTemplateColumns: COL, gap: 6, padding: "7px 0", fontSize: 12, alignItems: "center" };
  return (
    <div style={{ position: "relative" }}>
      <MockWindow title="cooklyt.in · Orders" right="3 in kitchen">
        <div style={{ display: "grid", gridTemplateColumns: "44px 1fr", minHeight: 360 }}>
          <div style={{ borderRight: "1px solid var(--line)", padding: "10px 6px", display: "flex", flexDirection: "column", gap: 2 }}>
            {[{ Icon: LayoutDashboard }, { Icon: ReceiptText, active: true }, { Icon: LayoutGrid }, { Icon: AlignLeft }, { Icon: BarChart2 }].map(({ Icon, active }, i) => (
              <span key={i} style={{ width: 32, height: 32, borderRadius: 6, display: "grid", placeItems: "center", background: active ? "var(--lp-accent-soft)" : "transparent", color: active ? "var(--lp-accent-deep)" : "var(--mute)" }}><Icon size={14} /></span>
            ))}
          </div>
          <div style={{ padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: "-.01em" }}>Orders</h3>
              <span style={{ fontSize: 11, color: "var(--mute)" }}>3 in kitchen · 7 total today</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: COL, gap: 6, paddingBottom: 6, borderBottom: "1px solid var(--line)", marginBottom: 6, fontFamily: MONO, fontSize: 10, color: "var(--mute)", textTransform: "uppercase", letterSpacing: ".08em" }}>
              <span /><span>Order</span><span>Status</span><span>Elapsed</span><span style={{ textAlign: "right" }}>Total</span><span />
            </div>
            {ROWS.map((row) => (
              <div key={row.key} style={{ ...rowBase, borderBottom: row.last ? 0 : "1px solid var(--line)" }}>
                <span />
                <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  {row.icon === "cart" && <ShoppingCart size={12} style={{ color: "var(--mute)" }} />}
                  {row.icon === "delivery" && <Truck size={12} style={{ color: "var(--mute)" }} />}
                  {row.sub ? <span style={{ fontSize: 11.5, fontWeight: 400, fontFamily: "inherit" }}>{row.sub}</span> : row.label}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--ink-2)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_DOT[row.status], flexShrink: 0 }} />
                  {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11, ...ELAPSED_STY[row.elStyle] }}>{row.elapsed}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, textAlign: "right" }}>{row.amount}</span>
                <span />
              </div>
            ))}
          </div>
        </div>
      </MockWindow>
      <div className="device-badge preview-badge" style={{ position: "absolute", right: -16, bottom: -16, padding: "12px 14px", background: "var(--ink)", color: "var(--accent-on)", borderRadius: 8, boxShadow: "0 14px 30px -10px rgba(10,10,10,.4)", minWidth: 180 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".12em", opacity: 0.55, textTransform: "uppercase" }}>Kitchen notified</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>Paneer Tikka × 1</div>
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: "rgba(250,250,248,.5)", marginTop: 4 }}>T03 · 2s ago</div>
      </div>
    </div>
  );
}

// ── Margin intelligence mockup ───────────────────────────────────────────────

function MarginMock() {
  const coupons = [
    { code: "WELCOME50", rate: "52%", kept: "₹210", weight: "bad" },
    { code: "WEEKDAY20", rate: "20%", kept: "₹372", weight: "warn" },
    { code: "FIRST10", rate: "10%", kept: "₹441", weight: "ok" },
  ];
  return (
    <MockWindow title="cooklyt.in · Economics" right="Last 30 days">
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {[["Per cover", "₹523"], ["Food cost", "31.4%"], ["Op. margin", "12.1%"]].map(([l, v]) => (
            <div key={l} style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "10px 12px" }}>
              <div style={LABEL}>{l}</div>
              <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, marginTop: 4, letterSpacing: "-.02em" }}>{v}</div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={LABEL}>Coupon contribution · net kept / order</span>
            <span style={{ fontSize: 10.5, color: "var(--mute)" }}>cheapest first</span>
          </div>
          <div style={{ border: "1px solid var(--line)", borderRadius: 9, overflow: "hidden" }}>
            {coupons.map((c, i) => (
              <div key={c.code} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center", padding: "9px 12px", borderTop: i ? "1px solid var(--line)" : 0 }}>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600 }}>{c.code}</span>
                <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 5, fontWeight: 600, background: c.weight === "bad" ? "var(--bad-soft)" : c.weight === "warn" ? "var(--warn-soft)" : "var(--ok-soft)", color: c.weight === "bad" ? "var(--bad)" : c.weight === "warn" ? "var(--warn)" : "var(--ok)" }}>−{c.rate}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, textAlign: "right", minWidth: 44 }}>{c.kept}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MockWindow>
  );
}

// ── Forecast + waste mockup ──────────────────────────────────────────────────

function ForecastMock() {
  const dishes = [
    { name: "Dal Makhani", surplus: 68, portions: "≈6 portions", rupees: "₹540", chronic: true },
    { name: "Jeera Rice", surplus: 44, portions: "≈4 portions", rupees: "₹190" },
    { name: "Butter Naan", surplus: 22, portions: "≈9 pcs", rupees: "₹115" },
  ];
  return (
    <MockWindow title="cooklyt.in · Waste forecast" right="Tomorrow · Wed">
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 13 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div>
            <div style={LABEL}>Predicted over-prep</div>
            <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, letterSpacing: "-.02em", marginTop: 3 }}>₹845</div>
          </div>
          <span style={{ fontSize: 11, color: "var(--mute)", maxWidth: 150, textAlign: "right", lineHeight: 1.4 }}>from the per-dish weekday pattern</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {dishes.map((d) => (
            <div key={d.name}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {d.name}
                  {d.chronic && <span style={{ fontSize: 9.5, fontWeight: 600, padding: "1px 6px", borderRadius: 4, background: "var(--warn-soft)", color: "var(--warn)" }}>chronic</span>}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11.5, color: "var(--mute)" }}>{d.portions} · {d.rupees}</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: "var(--paper-3)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${d.surplus}%`, borderRadius: 999, background: "var(--lp-grad)" }} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "var(--mute)", lineHeight: 1.45, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          Dishes below a history floor are held back — the forecast abstains rather than guess.
        </div>
      </div>
    </MockWindow>
  );
}

// ── Feature showcase row ─────────────────────────────────────────────────────

function ShowcaseRow({ eyebrow, title, body, points, Mock, flip, accent }) {
  const text = (
    <div className="reveal" style={{ maxWidth: 460 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", fontFamily: MONO, color: accent === "green" ? "var(--lp-secondary)" : "var(--lp-accent-deep)", fontWeight: 600 }}>
        {eyebrow}
      </span>
      <h3 style={{ fontSize: "clamp(24px, 3.4vw, 34px)", letterSpacing: "-.025em", lineHeight: 1.08, margin: "12px 0 14px", fontWeight: 600 }}>{title}</h3>
      <p style={{ color: "var(--ink-2)", fontSize: 15.5, lineHeight: 1.6, margin: "0 0 20px" }}>{body}</p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {points.map((p) => (
          <li key={p} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: "var(--ink)", lineHeight: 1.45 }}>
            <Check size={16} style={{ color: accent === "green" ? "var(--lp-secondary)" : "var(--lp-accent)", flexShrink: 0, marginTop: 2 }} />
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
  const visual = <div className="reveal reveal-d2" style={{ minWidth: 0 }}><Mock /></div>;
  return (
    <div className="showcase-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center", padding: "64px 0" }}>
      {flip ? <>{visual}{text}</> : <>{text}{visual}</>}
    </div>
  );
}

// ── Compact "also built" cards ───────────────────────────────────────────────

const ALSO = [
  { Icon: ShieldCheck, label: "Compliance & FSSAI", sub: "Licence expiry, staff certificates, hygiene sign-offs and a testing calendar — drift surfaced before an inspector finds it." },
  { Icon: Star, label: "Reputation", sub: "First-party guest reviews classified into themes, worst-first, with the search rankings you track by hand." },
  { Icon: Store, label: "Multi-outlet group view", sub: "Same-store sales growth and sales per labour hour across outlets — each abstaining where it can't yet report." },
  { Icon: Boxes, label: "Inventory & accounting", sub: "Recipe costing, low-stock reorder, and a period exported as balanced Tally-ready vouchers — no credentials." },
];

// ── Section nav cards ────────────────────────────────────────────────────────

const SECTION_CARDS = [
  { href: "/problem", Icon: Trash2, label: "The problem", sub: "Why kitchens bleed ₹3–6L a year" },
  { href: "/waste", Icon: BarChart3, label: "Waste intelligence", sub: "Tools that surface waste mid-shift" },
  { href: "/features", Icon: Grid3X3, label: "Features", sub: "The full suite, family by family" },
  { href: "/compare", Icon: Check, label: "How we compare", sub: "CookLyt vs a generic POS" },
  { href: "/mission", Icon: Package, label: "Our mission", sub: "Why we built this" },
  { href: "/access", Icon: Mail, label: "Get access", sub: "Working demo in 24 hours" },
];

// ── Pillar strip (six families, at a glance) ─────────────────────────────────

const PILLARS = [
  { Icon: ReceiptText, label: "Point of sale & KDS" },
  { Icon: Bot, label: "AI assistant + daily brief" },
  { Icon: Percent, label: "Margin intelligence" },
  { Icon: BarChart3, label: "Forecasting & waste" },
  { Icon: ShieldCheck, label: "Compliance & reputation" },
  { Icon: Store, label: "Multi-outlet group view" },
];

export default function Landing() {
  return (
    <LandingLayout>
      <Helmet>
        <title>CookLyt — The AI-native POS that defends your margin</title>
        <meta name="description" content="An AI-native POS for Indian restaurants: runs orders, tables and the kitchen, then reads the day back to you every morning and shows exactly where the margin leaks — in rupees." />
        <meta property="og:title" content="CookLyt — The AI-native POS that defends your margin" />
        <meta property="og:description" content="One system that runs service and watches every rupee — waste, coupons, per-cover spend, food cost — with an AI brief every morning." />
        <meta property="og:image" content="https://cooklyt.in/og/landing.png" />
      </Helmet>

      {/* ── Hero ── */}
      <section className="hero-section" style={{ position: "relative", overflow: "hidden" }}>
        <div className="lp-hero-wash" />
        <div className="lp-container" style={{ maxWidth: 1180, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 64, alignItems: "center" }} className="hero-grid">
            <div>
              <span className="lp-up lp-up-1" style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 26, padding: "4px 12px", border: "1px solid color-mix(in srgb, var(--lp-accent) 40%, var(--line-2))", background: "var(--lp-accent-soft)", borderRadius: 999, fontSize: 11.5, color: "var(--lp-accent-deep)", flexWrap: "wrap" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--lp-accent)", display: "inline-block", boxShadow: "0 0 0 3px color-mix(in srgb, var(--lp-accent) 22%, transparent)" }} />
                <span className="mono" style={{ letterSpacing: ".06em" }}>AI-native POS · Built in India</span>
              </span>
              <h1 className="lp-up lp-up-2" style={{ fontSize: "clamp(38px, 7vw, 82px)", lineHeight: 0.98, letterSpacing: "-.035em", fontWeight: 600, margin: "16px 0 24px" }}>
                Runs service.<br />Defends your{" "}
                <em style={{ fontStyle: "italic", fontWeight: 500, color: "var(--lp-accent-deep)", backgroundImage: "linear-gradient(transparent 76%, color-mix(in srgb, var(--lp-accent) 42%, transparent) 76%, color-mix(in srgb, var(--lp-accent) 42%, transparent) 92%, transparent 92%)" }}>margin</em>.
              </h1>
              <p className="lp-up lp-up-3" style={{ fontSize: 17, lineHeight: 1.55, color: "var(--ink-2)", maxWidth: 490, margin: "0 0 28px" }}>
                CookLyt runs orders, tables and the kitchen — then reads the day back to you each morning and shows exactly where the money leaks: waste, coupons, per-cover spend, food cost. In rupees, never guesses.
              </p>
              <div className="lp-up lp-up-3" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <a href={MAILTO_HREF} className="lp-btn-accent" style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 44, padding: "0 20px", borderRadius: 8, fontSize: 13.5, fontWeight: 600, color: "#fff", textDecoration: "none", whiteSpace: "nowrap" }}>
                  <Mail size={14} />Request a demo
                </a>
                <a href="/features" className="lp-link-ghost" style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 44, padding: "0 18px", borderRadius: 8, fontSize: 13.5, fontWeight: 500, border: "1px solid var(--line-2)", color: "var(--ink)", background: "transparent", textDecoration: "none", transition: "background .12s, border-color .12s, gap .12s", whiteSpace: "nowrap" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--lp-accent-soft)"; e.currentTarget.style.borderColor = "color-mix(in srgb, var(--lp-accent) 45%, var(--line-2))"; e.currentTarget.style.gap = "11px"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "var(--line-2)"; e.currentTarget.style.gap = "8px"; }}>
                  See everything it does<ArrowRight size={14} />
                </a>
              </div>
              <div className="lp-up lp-up-4" style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 28 }}>
                {["No credit card", "Full-access demo", "Ready in 24 hrs"].map((t) => (
                  <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--mute)", fontSize: 12.5 }}>
                    <Check size={13} style={{ color: "var(--lp-secondary)", opacity: 0.9 }} />{t}
                  </span>
                ))}
              </div>
            </div>
            <div className="hero-preview lp-up lp-up-4" style={{ paddingBottom: 12 }}>
              <BriefMock />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats strip ── */}
      <div style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", background: "color-mix(in srgb, var(--lp-accent-soft) 40%, var(--paper))" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }} className="stats-grid">
          {[
            { value: "< 3s", label: "Order to kitchen" },
            { value: "Every AM", label: "AI brief on the day before" },
            { value: "₹, not %", label: "Every leak priced honestly" },
            { value: "24 h", label: "From email to working demo" },
          ].map(({ value, label }, i) => (
            <div key={label} className={`reveal reveal-d${(i % 4) + 1}`} style={{ padding: "32px 26px", borderRight: i < 3 ? "1px solid var(--line)" : 0 }}>
              <div className="mono" style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-.02em", lineHeight: 1, background: "var(--lp-grad)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: "var(--lp-accent-deep)", width: "fit-content" }}>{value}</div>
              <div style={{ fontSize: 11, color: "var(--mute)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 10, lineHeight: 1.4 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Pillar strip ── */}
      <section style={{ borderBottom: "1px solid var(--line)", padding: "40px 0" }}>
        <div className="lp-container" style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div className="pillars" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14 }}>
            {PILLARS.map(({ Icon, label }, i) => (
              <div key={label} className={`reveal reveal-d${(i % 4) + 1}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 9, padding: "6px 4px" }}>
                <span style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: 11, background: "var(--lp-accent-soft)", color: "var(--lp-accent-deep)" }}><Icon size={19} strokeWidth={1.6} /></span>
                <span style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.3, fontWeight: 500 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section intro ── */}
      <section style={{ paddingTop: 72 }}>
        <div className="lp-container" style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div className="reveal" style={{ maxWidth: 640 }}>
            <span style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--lp-accent-deep)", fontFamily: MONO, fontWeight: 600 }}>What it actually does</span>
            <h2 style={{ fontSize: "clamp(28px, 4.4vw, 46px)", letterSpacing: "-.03em", lineHeight: 1.04, margin: "12px 0 14px", fontWeight: 600 }}>
              One system for the floor, the kitchen, and the P&amp;L.
            </h2>
            <p style={{ color: "var(--mute)", fontSize: 16, lineHeight: 1.6, margin: 0, maxWidth: 560 }}>
              Most POS software stops at ringing up a bill. CookLyt keeps going — into the numbers a generic till never shows you, and it only ever shows a figure it can defend.
            </p>
          </div>
        </div>
      </section>

      {/* ── Showcase rows ── */}
      <div className="lp-container" style={{ maxWidth: 1180, margin: "0 auto" }}>
        <ShowcaseRow
          eyebrow={<><ReceiptText size={13} /> Point of sale & KDS</>}
          title="Every channel, one live kitchen."
          body="Dine-in, takeaway and delivery ring into the same board. The kitchen sees each ticket the moment it's placed, with the table, the elapsed time and the amount — nothing re-keyed, nothing lost between the counter and the pass."
          points={["Real-time order → kitchen in under three seconds", "Tables, waitlist, reservations and covers in one place", "Offline-tolerant sync so a dropped connection never stalls service"]}
          Mock={PosMock}
        />
        <div style={{ borderTop: "1px solid var(--line)" }} />
        <ShowcaseRow
          flip
          accent="green"
          eyebrow={<><Sunrise size={13} /> AI brief + assistant</>}
          title="Your day, read back to you at 9am."
          body="A local model narrates the numbers the POS already computed: how yesterday traded against a normal day, the one action worth the most rupees, food cost, waste, the peak hour. Ask it anything in plain language — it answers from your real figures or says it can't."
          points={["Deterministic signals, AI wording — it narrates, never invents", "Abstains where a figure is missing instead of guessing a zero", "Runs on a local model; your data never leaves the building"]}
          Mock={BriefMock}
        />
        <div style={{ borderTop: "1px solid var(--line)" }} />
        <ShowcaseRow
          eyebrow={<><Percent size={13} /> Margin intelligence</>}
          title="Find the leak the till hides."
          body="Every coupon ranked by the net revenue it actually keeps per order. Per-cover spend, food cost and operating margin. Attach rate on the high-margin categories. The service charge staff quietly remove. The half-rupees that decide whether a month is green."
          points={["Coupon contribution — which offer is paying to be popular", "Average per cover, prime cost and operating margin", "Category attach rate and service-charge leakage, by server"]}
          Mock={MarginMock}
        />
        <div style={{ borderTop: "1px solid var(--line)" }} />
        <ShowcaseRow
          flip
          accent="green"
          eyebrow={<><BarChart3 size={13} /> Forecasting & waste</>}
          title="Prep for tomorrow, not yesterday."
          body="A seasonal-naive engine learns each dish's weekday pattern and projects likely over-prep for the next service — in portions and rupees — flagging the chronic over-preppers. Promo days are detected and excluded, and any dish below a history floor is held back rather than guessed."
          points={["Per-dish, per-weekday over-prep forecast in rupees", "Demand, prep, inventory and shift planning on one engine", "Every prediction carries the accuracy it earned"]}
          Mock={ForecastMock}
        />
      </div>

      {/* ── Also built in ── */}
      <section style={{ borderTop: "1px solid var(--line)", padding: "72px 0", background: "var(--paper-2)" }}>
        <div className="lp-container" style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div className="reveal" style={{ marginBottom: 32, maxWidth: 560 }}>
            <span style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--lp-secondary)", fontFamily: MONO, fontWeight: 600 }}>And the rest of the back office</span>
            <h2 style={{ fontSize: "clamp(24px, 3.6vw, 38px)", letterSpacing: "-.025em", lineHeight: 1.05, margin: "12px 0 0", fontWeight: 600 }}>
              The unglamorous parts, done properly.
            </h2>
          </div>
          <div className="also-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
            {ALSO.map(({ Icon, label, sub }, i) => (
              <div key={label} className={`lp-card reveal reveal-d${(i % 4) + 1}`} style={{ border: "1px solid var(--line)", borderRadius: 12, background: "var(--paper)", padding: "22px 24px" }}>
                <span className="lp-card-icon" style={{ display: "inline-grid", placeItems: "center", width: 34, height: 34, borderRadius: 9, background: "var(--lp-secondary-soft)", color: "var(--lp-secondary)", marginBottom: 14 }}>
                  <Icon size={18} strokeWidth={1.6} />
                </span>
                <h3 style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-.01em", margin: "0 0 6px" }}>{label}</h3>
                <p style={{ color: "var(--mute)", margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Honesty band ── */}
      <section style={{ borderTop: "1px solid var(--line)", padding: "64px 0" }}>
        <div className="lp-container" style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
          <span className="reveal" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--lp-accent-deep)", fontFamily: MONO, fontWeight: 600 }}>
            <ShieldCheck size={14} /> The one rule
          </span>
          <p className="reveal reveal-d1" style={{ fontSize: "clamp(20px, 3vw, 28px)", lineHeight: 1.4, letterSpacing: "-.015em", margin: "16px 0 0", fontWeight: 500, color: "var(--ink)" }}>
            A number CookLyt cannot establish is never shown as zero. Every metric abstains where the data is thin and states what it's missing — so the figure you act on is one you can trust.
          </p>
        </div>
      </section>

      {/* ── Section nav cards ── */}
      <section style={{ borderTop: "1px solid var(--line)", padding: "56px 0 0" }}>
        <div className="lp-container" style={{ maxWidth: 1180, margin: "0 auto", marginBottom: 32 }}>
          <span style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--mute)", fontFamily: MONO }}>Explore CookLyt</span>
        </div>
        <div style={{ maxWidth: 1180, margin: "0 auto", borderTop: "1px solid var(--line)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }} className="section-cards">
            {SECTION_CARDS.map(({ href, Icon, label, sub }, i) => (
              <a key={href} href={href} className={`lp-card reveal reveal-d${(i % 3) + 1}`}
                style={{ display: "block", padding: "28px 28px 32px", borderRight: (i + 1) % 3 !== 0 ? "1px solid var(--line)" : 0, borderBottom: "1px solid var(--line)", textDecoration: "none", color: "var(--ink)" }}>
                <span className="lp-card-icon" style={{ display: "inline-grid", placeItems: "center", width: 26, height: 26, color: "var(--ink)", marginBottom: 12 }}>
                  <Icon size={20} strokeWidth={1.5} />
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-.005em", margin: 0 }}>{label}</h3>
                  <ArrowRight size={13} style={{ color: "var(--lp-accent)", flexShrink: 0 }} />
                </div>
                <p style={{ color: "var(--mute)", margin: 0, fontSize: 13, lineHeight: 1.5 }}>{sub}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="final-cta" style={{ position: "relative", overflow: "hidden", textAlign: "center", background: "var(--paper-2)", borderTop: "1px solid var(--line)", padding: "120px 0" }}>
        <div className="lp-hero-wash" style={{ opacity: 0.7 }} />
        <div className="lp-container reveal" style={{ maxWidth: 1180, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 36 }}>
            {LOGO_SVG(44, 44)}
            {WORDMARK_SVG(136, 24)}
          </div>
          <h2 style={{ fontSize: "clamp(32px, 5.5vw, 64px)", letterSpacing: "-.03em", lineHeight: 1.05, margin: "8px 0 16px", fontWeight: 600 }}>
            See your own kitchen<br />on CookLyt.
          </h2>
          <p style={{ color: "var(--mute)", fontSize: 15, maxWidth: 480, margin: "0 auto 32px" }}>
            No sales call. No slideshow. Just a working demo of your restaurant — orders, margins and the morning brief — running on CookLyt.
          </p>
          <a href={MAILTO_HREF} className="cta-email lp-btn-accent" style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "16px 22px", maxWidth: "100%", boxSizing: "border-box", color: "#fff", fontFamily: MONO, fontSize: 14, borderRadius: 10, textDecoration: "none", wordBreak: "break-all" }}>
            <Mail size={16} style={{ flexShrink: 0 }} />{DEMO_EMAIL}
          </a>
          <p style={{ display: "block", marginTop: 18, color: "var(--mute-2)", fontSize: 12 }}>We reply within a few hours.</p>
        </div>
      </section>

      <style>{`
        .hero-section { padding: 72px 0 96px; }

        @media (max-width: 980px) {
          .hero-grid { grid-template-columns: 1fr !important; gap: 48px !important; }
          .showcase-row { grid-template-columns: 1fr !important; gap: 36px !important; padding: 48px 0 !important; }
          .showcase-row > .reveal:last-child { order: 2; }
          .showcase-row > .reveal:first-child { order: 1; }
          .pillars { grid-template-columns: repeat(3, 1fr) !important; gap: 20px 14px !important; }
        }
        @media (max-width: 860px) {
          .section-cards { grid-template-columns: repeat(2, 1fr) !important; }
          .section-cards > a:nth-child(odd)  { border-right: 1px solid var(--line) !important; }
          .section-cards > a:nth-child(even) { border-right: 0 !important; }
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .stats-grid > div { border-bottom: 1px solid var(--line); }
          .stats-grid > div:nth-child(2) { border-right: 0 !important; }
          .also-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 768px) {
          .hero-section { padding: 52px 0 60px !important; }
          .final-cta    { padding: 72px 0 !important; }
        }
        @media (max-width: 620px) {
          .pillars { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 520px) {
          .section-cards { grid-template-columns: 1fr !important; }
          .section-cards > a { border-right: 0 !important; }
          .stats-grid { grid-template-columns: 1fr !important; }
          .stats-grid > div { border-right: 0 !important; }
          .stats-grid > div:last-child { border-bottom: 0 !important; }
        }
        @media (max-width: 480px) {
          .hero-section { padding: 40px 0 48px !important; }
          .cta-email    { font-size: 12px !important; padding: 14px 16px !important; }
        }
      `}</style>
    </LandingLayout>
  );
}
