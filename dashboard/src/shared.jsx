import React from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle } from "lucide-react";

export const DEMO_EMAIL = "hello@cooklyt.in";
export const MAILTO_HREF = `mailto:${DEMO_EMAIL}?subject=${encodeURIComponent("CookLyt POS – Demo Request")}&body=${encodeURIComponent("Hi,\n\nI'm interested in a live demo of CookLyt POS for my restaurant.\n\nName:\nRestaurant name:\nNumber of locations:\nBest time to reach me:\n\nThanks,")}`;
export const WHATSAPP_HREF = `https://wa.me/919873665365?text=${encodeURIComponent("Hi, I'd like a CookLyt demo for my restaurant.")}`;

export const SEC   = { fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--mute)", fontFamily: '"Geist Mono", monospace' };
export const SEC_H2 = { fontSize: "clamp(28px, 4vw, 44px)", letterSpacing: "-.025em", lineHeight: 1.05, margin: "8px 0 12px", fontWeight: 600 };
export const SEC_P  = { color: "var(--mute)", margin: 0, fontSize: 15, lineHeight: 1.55, maxWidth: 520 };

export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem("pos_user") || "null"); } catch { return null; }
}

export const LOGO_SVG = (w, h) => (
  <svg width={w} height={h} viewBox="0 0 200 200" fill="none" aria-hidden="true">
    <path d="M 154.194 25.409 A 92.2 92.2 0 1 0 154.194 174.591" fill="none" stroke="#0d0c0b" strokeWidth="15.6" strokeLinecap="round" />
    <circle cx="100" cy="100" r="10.8" fill="#b06a3b" />
  </svg>
);

export const WORDMARK_SVG = (w, h) => (
  <svg width={w} height={h} viewBox="0 0 360 64" role="img" aria-label="CookLyt">
    <title>CookLyt</title>
    <text x="0" y="49" fill="#0d0c0b" style={{ fontFamily: "'Marcellus', serif", fontSize: 56, letterSpacing: "10.08px" }}>COOKLY</text>
    <circle cx="294.2" cy="29.43" r="5.03" fill="#b06a3b" />
    <text x="309.33" y="49" fill="#0d0c0b" style={{ fontFamily: "'Marcellus', serif", fontSize: 56, letterSpacing: "10.08px" }}>T</text>
  </svg>
);



const FOOTER_LINK_STYLE = {
  display: "block",
  fontSize: 13,
  color: "var(--mute)",
  textDecoration: "none",
  lineHeight: 1,
  padding: "5px 0",
  transition: "color .1s",
  background: "transparent",
  border: 0,
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left",
};

function FooterLink({ href, onClick, children }) {
  const [hovered, setHovered] = React.useState(false);
  const style = { ...FOOTER_LINK_STYLE, color: hovered ? "var(--ink)" : "var(--mute)" };
  if (onClick) {
    return (
      <button style={style} onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        {children}
      </button>
    );
  }
  return (
    <a href={href} style={style} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {children}
    </a>
  );
}

function FooterCol({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 130 }}>
      <span style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--mute-2)", fontFamily: '"Geist Mono", monospace', marginBottom: 8 }}>
        {label}
      </span>
      {children}
    </div>
  );
}

export function PageFooter() {
  const navigate = useNavigate();
  const user = getStoredUser();

  return (
    <footer style={{ background: "var(--paper-2)", borderTop: "1px solid var(--line)", paddingTop: 56, paddingBottom: 32 }}>
      <div className="lp-container" style={{ maxWidth: 1180, margin: "0 auto" }}>

        {/* Top: brand + columns */}
        <div className="footer-cols" style={{ display: "flex", gap: 48, flexWrap: "wrap", marginBottom: 48 }}>

          {/* Brand block */}
          <div style={{ flex: "1 1 220px", minWidth: 200, maxWidth: 280 }}>
            <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 9, textDecoration: "none", marginBottom: 14 }}>
              {LOGO_SVG(22, 22)}
              <span style={{ fontFamily: "'Marcellus', serif", fontSize: 17, letterSpacing: ".04em", color: "var(--ink)" }}>CookLyt</span>
            </a>
            <p style={{ fontSize: 13, color: "var(--mute)", lineHeight: 1.6, margin: "0 0 20px" }}>
              AI-native POS &amp; demand intelligence for India's specialty cafés and QSRs.
            </p>
            <a
              href={WHATSAPP_HREF}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                height: 34, padding: "0 14px", borderRadius: 6,
                fontSize: 12.5, fontWeight: 500,
                background: "var(--ink)", color: "var(--accent-on)",
                textDecoration: "none", transition: "background .08s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--ink-2)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--ink)"; }}
            >
              <MessageCircle size={12} />
              Request a demo
            </a>
          </div>

          {/* Spacer to push columns right */}
          <div style={{ flex: "1 1 0" }} />

          {/* Product column */}
          <FooterCol label="Product">
            <FooterLink href="/features">Features</FooterLink>
            <FooterLink href="/waste">Waste intelligence</FooterLink>
            <FooterLink href="/compare">How we compare</FooterLink>
            <FooterLink href="/access">Get access</FooterLink>
          </FooterCol>

          {/* Company column */}
          <FooterCol label="Company">
            <FooterLink href="/problem">The problem</FooterLink>
            <FooterLink href="/mission">Our mission</FooterLink>
            <FooterLink href={MAILTO_HREF}>Contact us</FooterLink>
          </FooterCol>

          {/* Account column */}
          <FooterCol label="Account">
            <FooterLink onClick={() => navigate(user ? "/overview" : "/login")}>
              {user ? "Dashboard" : "Sign in"}
            </FooterLink>
            {!user && <FooterLink href="/access">Request access</FooterLink>}
          </FooterCol>
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontSize: 11.5, color: "var(--mute-2)", fontFamily: '"Geist Mono", monospace' }}>
            © {new Date().getFullYear()} CookLyt · Bengaluru, India
          </span>

        </div>

      </div>

      <style>{`
        @media (max-width: 600px) {
          .footer-cols { flex-direction: column !important; }
        }
      `}</style>
    </footer>
  );
}

export function PageCTA() {
  return (
    <section style={{ textAlign: "center", background: "var(--paper-2)", borderTop: "1px solid var(--line)", padding: "80px 0" }}>
      <div className="lp-container" style={{ maxWidth: 860, margin: "0 auto" }}>
        <h2 style={{ fontSize: "clamp(26px, 4vw, 42px)", letterSpacing: "-.025em", lineHeight: 1.1, margin: "0 0 14px", fontWeight: 600 }}>
          Ready to see it live?
        </h2>
        <p style={{ color: "var(--mute)", fontSize: 15, maxWidth: 420, margin: "0 auto 28px", lineHeight: 1.55 }}>
          No sales call. No slideshow. A working demo of your restaurant on CookLyt — ready in 24 hours.
        </p>
        <a
          href={WHATSAPP_HREF}
          target="_blank"
          rel="noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 44, padding: "0 20px", borderRadius: 6, fontSize: 13.5, fontWeight: 500, background: "var(--ink)", color: "var(--accent-on)", textDecoration: "none", transition: "background .08s, transform .08s, box-shadow .12s" }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--ink-2)"; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(10,10,10,.18)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "var(--ink)"; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
          onMouseDown={e => { e.currentTarget.style.transform = "scale(0.98)"; }}
          onMouseUp={e => { e.currentTarget.style.transform = "translateY(-1px)"; }}
        >
          <MessageCircle size={14} />
          Request a demo on WhatsApp
        </a>
      </div>
    </section>
  );
}
