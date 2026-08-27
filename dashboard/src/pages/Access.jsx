import LandingLayout from "../LandingLayout";
import { Helmet } from "react-helmet-async";
import { SEC, MAILTO_HREF, DEMO_EMAIL, LOGO_SVG, WORDMARK_SVG } from "../shared";
import { ArrowRight, Mail, Check, Coffee, UtensilsCrossed, BarChart2, Leaf } from "lucide-react";

const MENU_ITEMS = [
  { name: "Flat White",        cat: "Espresso", price: "\u20b9220", sold: 34 },
  { name: "Pourover \u2013 Kenya",  cat: "Filter",   price: "\u20b9280", sold: 19 },
  { name: "Avocado Toast",     cat: "Food",     price: "\u20b9340", sold: 12 },
  { name: "Cold Brew",         cat: "Cold",     price: "\u20b9200", sold: 28 },
  { name: "Cortado",           cat: "Espresso", price: "\u20b9190", sold: 21 },
];

function DemoPreview() {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ border: "1px solid var(--line-2)", background: "var(--paper)", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 0 rgba(255,255,255,.6) inset, 0 24px 64px -28px rgba(10,10,10,.18)" }}>
        <div style={{ height: 36, borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 8, padding: "0 14px", background: "var(--paper-2)" }}>
          <div style={{ display: "flex", gap: 5 }}>
            {[0,1,2].map(i => <span key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--line-2)", display: "inline-block" }} />)}
          </div>
          <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 11, color: "var(--mute)", marginLeft: 8 }}>cooklyt.in · Your demo</span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, fontFamily: '"Geist Mono", monospace', fontSize: 10, color: "var(--ok)" }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ok)", display: "inline-block" }} />
            Ready
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid var(--line)" }}>
          {[
            { Icon: Coffee,          label: "Orders today", val: "47" },
            { Icon: UtensilsCrossed, label: "Avg bill",     val: "\u20b9318" },
            { Icon: BarChart2,       label: "Revenue",      val: "\u20b914,946" },
            { Icon: Leaf,            label: "Waste saved",  val: "\u20b92,100" },
          ].map(({ Icon, label, val }) => (
            <div key={label} style={{ padding: "12px 14px", borderRight: "1px solid var(--line)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                <Icon size={11} style={{ color: "var(--mute)" }} />
                <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 9.5, color: "var(--mute)", letterSpacing: ".06em", textTransform: "uppercase" }}>{label}</span>
              </div>
              <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{val}</div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", padding: "6px 14px", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 9.5, color: "var(--mute-2)", letterSpacing: ".1em", textTransform: "uppercase" }}>Item</span>
            <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 9.5, color: "var(--mute-2)", letterSpacing: ".1em", textTransform: "uppercase", textAlign: "right", paddingRight: 24 }}>Price</span>
            <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 9.5, color: "var(--mute-2)", letterSpacing: ".1em", textTransform: "uppercase", textAlign: "right" }}>Sold</span>
          </div>
          {MENU_ITEMS.map(({ name, cat, price, sold }, i) => (
            <div key={name} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", padding: "9px 14px", borderBottom: i < MENU_ITEMS.length - 1 ? "1px solid var(--line)" : 0, background: i % 2 === 0 ? "transparent" : "var(--paper-2)" }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink)" }}>{name}</div>
                <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10, color: "var(--mute)", marginTop: 1 }}>{cat}</div>
              </div>
              <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 12, color: "var(--ink-2)", textAlign: "right", paddingRight: 24 }}>{price}</div>
              <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 12, fontWeight: 600, color: "var(--copper)", textAlign: "right" }}>{sold}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="preview-badge" style={{ position: "absolute", right: -14, bottom: -14, padding: "10px 14px", background: "var(--ink)", color: "var(--accent-on)", borderRadius: 8, boxShadow: "0 14px 30px -10px rgba(10,10,10,.4)", minWidth: 170 }}>
        <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 9.5, letterSpacing: ".12em", opacity: 0.5, textTransform: "uppercase" }}>Demo provisioned</div>
        <div style={{ fontSize: 12.5, marginTop: 5 }}>Your café · 5 tables</div>
        <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10, color: "rgba(250,250,248,.45)", marginTop: 3 }}>Ready to explore →</div>
      </div>
    </div>
  );
}


const STEPS = [
  { n: "01", title: "Send an email",          body: "Tell us your restaurant name and a couple of details. We'll take it from there.", cta: true },
  { n: "02", title: "We provision your demo", body: "Our team spins up a live instance — your menu, your tables, a believable order history. Not a sandbox. The real thing.", cta: false },
  { n: "03", title: "Log in & explore",       body: "Place orders, fire the kitchen, pull reports, log waste — exactly as it works in production. No limits on what you can touch.", cta: false },
];

const INCLUDED = [
  "Full-access demo environment",
  "Pre-loaded with your menu",
  "Realistic order history seeded",
  "Waste intelligence enabled",
  "No credit card required",
  "Ready within 24 hours",
];

export default function Access() {
  return (
    <LandingLayout>
      <Helmet>
        <title>Get Access — CookLyt</title>
        <meta name="description" content="Get a working demo of CookLyt built around your menu within 24 hours." />
        <meta property="og:title" content="Get a CookLyt demo for your restaurant" />
        <meta property="og:description" content="Get a working demo of CookLyt built around your menu within 24 hours." />
        <meta property="og:image" content="https://cooklyt.in/og/access.png" />
      </Helmet>
      {/* ── Hero ── */}
      <section style={{ padding: "80px 0 64px", borderBottom: "1px solid var(--line)" }}>
        <div className="lp-container" style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 64, alignItems: "center" }} className="page-hero-grid">
            <div>
              <span style={SEC}>Get access</span>
              <h1 style={{ fontSize: "clamp(36px, 6vw, 72px)", letterSpacing: "-.03em", lineHeight: 1.0, fontWeight: 600, margin: "12px 0 20px", maxWidth: 700 }}>
                A working demo of your restaurant. Ready in 24 hours.
              </h1>
              <p style={{ color: "var(--mute)", fontSize: 17, maxWidth: 480, margin: 0, lineHeight: 1.55 }}>
                CookLyt is invite-only. Every demo is a real working environment seeded with your menu and a real day’s worth of orders. No slideshow.
              </p>
            </div>
            <div className="page-hero-preview" style={{ paddingBottom: 32, paddingRight: 32 }}>
              <DemoPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ── Steps ── */}
      <section style={{ borderTop: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }} className="process-grid">
            {STEPS.map(({ n, title, body, cta }, i) => (
              <div key={n} style={{ padding: "40px 28px 44px", borderRight: i < 2 ? "1px solid var(--line)" : 0, borderBottom: "1px solid var(--line)" }}>
                <div className="mono" style={{ fontSize: 11, color: "var(--mute)", letterSpacing: ".14em", marginBottom: 16 }}>{n}</div>
                <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-.01em", margin: "0 0 10px" }}>{title}</h3>
                <p style={{ color: "var(--mute)", margin: 0, fontSize: 14.5, lineHeight: 1.6 }}>{body}</p>
                {cta && (
                  <a href={MAILTO_HREF}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 18, fontSize: 13, color: "var(--ink)", borderBottom: "1px solid var(--line-2)", paddingBottom: 1, textDecoration: "none", transition: "border-color .08s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ink)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--line-2)"; }}
                  >
                    Open email <ArrowRight size={12} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What's included ── */}
      <section style={{ borderTop: "1px solid var(--line)", background: "var(--paper-2)", padding: "72px 0" }}>
        <div className="lp-container access-included" style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center" }}>
          <div>
            <span style={SEC}>What's in the demo</span>
            <h2 style={{ fontSize: "clamp(26px, 3.5vw, 40px)", letterSpacing: "-.025em", lineHeight: 1.1, fontWeight: 600, margin: "10px 0 16px" }}>
              The full product. Not a preview.
            </h2>
            <p style={{ color: "var(--mute)", fontSize: 15, lineHeight: 1.6, maxWidth: 420 }}>
              We don't believe in demos that show you half the product. Every feature is live — waste tracking, inventory, reports, loyalty, everything.
            </p>
          </div>
          <div className="included-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {INCLUDED.map(item => (
              <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 16px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--paper)", fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.4 }}>
                <Check size={14} style={{ color: "var(--ok)", flexShrink: 0, marginTop: 1 }} />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section style={{ textAlign: "center", borderTop: "1px solid var(--line)", background: "var(--paper)", padding: "100px 0" }}>
        <div className="lp-container" style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 36 }}>
            {LOGO_SVG(44, 44)}
            {WORDMARK_SVG(136, 24)}
          </div>
          <h2 style={{ fontSize: "clamp(32px, 5.5vw, 64px)", letterSpacing: "-.03em", lineHeight: 1.05, margin: "0 0 16px", fontWeight: 600 }}>
            Find out how much your kitchen is wasting.
          </h2>
          <p style={{ color: "var(--mute)", fontSize: 15, maxWidth: 440, margin: "0 auto 32px", lineHeight: 1.6 }}>
            No sales call. No slideshow. A working demo of your restaurant on CookLyt — and a clear view of the waste you're currently invisible to.
          </p>
          <a href={MAILTO_HREF} className="cta-email"
            style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "16px 22px", background: "var(--ink)", color: "var(--accent-on)", fontFamily: '"Geist Mono", monospace', fontSize: 14, borderRadius: 8, textDecoration: "none", transition: "transform .12s ease, background .12s ease", wordBreak: "break-all" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--ink-2)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--ink)"; e.currentTarget.style.transform = "none"; }}
          >
            <Mail size={16} style={{ flexShrink: 0 }} />{DEMO_EMAIL}
          </a>
          <p style={{ display: "block", marginTop: 18, color: "var(--mute-2)", fontSize: 12 }}>We reply within a few hours.</p>
        </div>
      </section>

      <style>{`
        @media (max-width: 860px) {
          .page-hero-grid    { grid-template-columns: 1fr !important; gap: 48px !important; }
          .page-hero-preview { padding-right: 32px !important; }
          .process-grid { grid-template-columns: 1fr !important; }
          .process-grid > div { border-right: 0 !important; }
          .access-included { grid-template-columns: 1fr !important; gap: 36px !important; }
        }
        /* hero preview now stays visible on phones — badge shrunk in LandingLayout */
        @media (max-width: 480px) {
          .cta-email { font-size: 12px !important; padding: 14px 16px !important; }
          .included-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </LandingLayout>
  );
}
