import { useNavigate } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import { Mail, ChevronDown, Menu, X } from "lucide-react";
import { LOGO_SVG, WORDMARK_SVG, MAILTO_HREF, getStoredUser, PageFooter } from "./shared";

// Primary links shown directly in the nav
const PRIMARY_LINKS = [
  { href: "/waste",    label: "Waste intelligence" },
  { href: "/features", label: "Features" },
  { href: "/access",   label: "Get access" },
];

// Secondary links tucked under "Learn more"
const SECONDARY_LINKS = [
  { href: "/problem",  label: "The problem" },
  { href: "/compare",  label: "How we compare" },
  { href: "/mission",  label: "Our mission" },
];

function DropdownMenu({ label, links, nlBase, nlHover, nlLeave }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="nav-text-link"
        style={{ ...nlBase, gap: 3 }}
        onClick={() => setOpen(o => !o)}
        onMouseEnter={nlHover}
        onMouseLeave={nlLeave}
      >
        {label}
        <ChevronDown size={12} style={{ transition: "transform .15s", transform: open ? "rotate(180deg)" : "rotate(0deg)", opacity: 0.6 }} />
      </button>
      {open && (
        // Matches the dashboard dropdown chrome (SelectField/Combobox): anchored
        // to the trigger's left edge, --line-2 border, full-width rows with an
        // edge-to-edge hover highlight.
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
          minWidth: 180, overflow: "hidden",
          background: "var(--paper)", border: "1px solid var(--line-2)", borderRadius: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,.12)", padding: "4px 0",
        }}>
          {links.map(({ href, label }) => (
            <a
              key={href} href={href}
              style={{
                display: "block", width: "100%", boxSizing: "border-box", textAlign: "left",
                padding: "8px 14px", fontSize: 13, color: "var(--mute)",
                textDecoration: "none", whiteSpace: "nowrap", fontFamily: "inherit",
                transition: "background .08s, color .08s",
              }}
              onMouseEnter={nlHover} onMouseLeave={nlLeave}
              onClick={() => setOpen(false)}
            >
              {label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LandingLayout({ children }) {
  const navigate = useNavigate();
  const user = getStoredUser();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileNavRef = useRef(null);
  const mobileBtnRef = useRef(null);

  // Close the mobile menu if the viewport grows past the breakpoint where the
  // hamburger (and its close button) disappears — otherwise the menu would be
  // left open with no way to dismiss it. Must match the 900px nav breakpoint.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 901px)");
    const handler = (e) => { if (e.matches) setMobileOpen(false); };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Dismiss the dropdown on an outside tap. It's a compact menu now, not a
  // full-screen overlay, so the page behind stays scrollable and interactive.
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e) => {
      if (mobileNavRef.current?.contains(e.target)) return;
      if (mobileBtnRef.current?.contains(e.target)) return; // the toggle handles itself
      setMobileOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mobileOpen]);

  const nlBase = {
    height: 32, padding: "0 12px", borderRadius: 6, fontSize: 13, color: "var(--mute)",
    display: "inline-flex", alignItems: "center", transition: "background .08s, color .08s",
    textDecoration: "none", border: 0, cursor: "pointer", background: "transparent",
    fontFamily: "inherit", whiteSpace: "nowrap",
  };
  const nlHover = (e) => { e.currentTarget.style.background = "var(--hover)"; e.currentTarget.style.color = "var(--ink)"; };
  const nlLeave = (e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--mute)"; };

  const mobileLink = {
    display: "flex", alignItems: "center", width: "100%", boxSizing: "border-box",
    height: 44, padding: "0 16px", fontSize: 14.5, color: "var(--ink)",
    textDecoration: "none", border: 0, background: "transparent",
    fontFamily: "inherit", cursor: "pointer", textAlign: "left",
    transition: "background .08s",
  };
  const mobileEnter = (e) => { e.currentTarget.style.background = "var(--hover)"; };
  const mobileLeave = (e) => { e.currentTarget.style.background = "transparent"; };

  return (
    <div style={{ background: "var(--paper)", color: "var(--ink)", minHeight: "100vh" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(250,250,248,.78)", backdropFilter: "blur(14px) saturate(140%)", WebkitBackdropFilter: "blur(14px) saturate(140%)", borderBottom: "1px solid var(--line)" }}>
        <div className="nav-inner" style={{ maxWidth: 1180, margin: "0 auto", padding: "0 28px", height: 56, display: "flex", alignItems: "center", gap: 18 }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "var(--ink)", flexShrink: 0 }}>
            {LOGO_SVG(20, 20)}
            {WORDMARK_SVG(100, 18)}
          </a>
          <nav style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
            {PRIMARY_LINKS.map(({ href, label }) => (
              <a key={href} href={href} className="nav-text-link" style={nlBase} onMouseEnter={nlHover} onMouseLeave={nlLeave}>{label}</a>
            ))}
            <DropdownMenu label="Learn more" links={SECONDARY_LINKS} nlBase={nlBase} nlHover={nlHover} nlLeave={nlLeave} />
            <button onClick={() => navigate(user ? "/overview" : "/login")} className="nav-text-link" style={nlBase} onMouseEnter={nlHover} onMouseLeave={nlLeave}>
              {user ? "Dashboard" : "Sign in"}
            </button>
            <a href={MAILTO_HREF}
              style={{ ...nlBase, background: "var(--ink)", color: "var(--accent-on)", padding: "0 14px", height: 34, gap: 6 }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--ink-2)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--ink)"; }}
            >
              <Mail size={13} /><span className="nav-demo-label">Request a demo</span>
            </a>
            <button
              ref={mobileBtnRef}
              className="nav-mobile-btn"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(o => !o)}
              style={{
                display: "none", alignItems: "center", justifyContent: "center",
                width: 36, height: 36, borderRadius: 6, border: 0,
                background: "transparent", color: "var(--ink)", cursor: "pointer",
              }}
            >
              {mobileOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
          </nav>
        </div>
      </header>

      {/* Mobile menu — a compact dropdown sized to its content, anchored under
          the hamburger (not a full-screen sheet). Rendered as a SIBLING of
          <header>, not a child: the header's backdrop-filter establishes a
          containing block for position:fixed descendants, which would otherwise
          trap it inside the 56px-tall header box. */}
      {mobileOpen && (
        <div
          ref={mobileNavRef}
          style={{
            position: "fixed", top: 60, right: 14, zIndex: 45,
            width: 244, maxWidth: "calc(100vw - 28px)",
            maxHeight: "calc(100dvh - 72px)", overflowY: "auto",
            background: "var(--paper)", border: "1px solid var(--line-2)",
            borderRadius: 12, boxShadow: "0 10px 34px -8px rgba(10,10,10,.24)",
          }}
        >
          <div style={{ padding: "6px 0" }}>
            {[...PRIMARY_LINKS, ...SECONDARY_LINKS].map(({ href, label }) => (
              <a
                key={href} href={href} style={mobileLink}
                onMouseEnter={mobileEnter} onMouseLeave={mobileLeave}
                onClick={() => setMobileOpen(false)}
              >
                {label}
              </a>
            ))}
            <button
              style={mobileLink}
              onMouseEnter={mobileEnter} onMouseLeave={mobileLeave}
              onClick={() => { setMobileOpen(false); navigate(user ? "/overview" : "/login"); }}
            >
              {user ? "Dashboard" : "Sign in"}
            </button>
          </div>
          <div style={{ padding: "8px 12px 12px", borderTop: "1px solid var(--line)" }}>
            <a
              href={MAILTO_HREF}
              onClick={() => setMobileOpen(false)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                height: 42, borderRadius: 8, fontSize: 13.5, fontWeight: 500,
                background: "var(--ink)", color: "var(--accent-on)", textDecoration: "none",
              }}
            >
              <Mail size={15} /> Request a demo
            </a>
          </div>
        </div>
      )}

      <main>{children}</main>

      <PageFooter />

      <style>{`
        .lp-container { padding-left: 28px; padding-right: 28px; }
        .footer-inner { max-width: 1180px; margin: 0 auto; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }

        /* Collapse the inline links into the hamburger well before they get
           cramped. The full nav needs ~810px to fit, so anything narrower
           (iPad Air 820, iPad Mini 768, etc.) is overcrowded — switch to the
           menu button below 900px. */
        @media (max-width: 900px) {
          .nav-text-link  { display: none !important; }
          .nav-mobile-btn { display: inline-flex !important; }
        }
        @media (max-width: 620px) {
          .nav-demo-label { display: none !important; }
          .nav-inner      { padding: 0 18px !important; }
          /* Hero previews stay visible on phones (they're the signature visual).
             The floating badge's 180px min-width dominates a small card, so let
             it shrink to its content width — it still overhangs into the
             wrapper's 32px buffer without spilling past the viewport. */
          .preview-badge  { min-width: 0 !important; padding: 9px 12px !important; }
        }
        @media (max-width: 480px) {
          .lp-container { padding-left: 18px !important; padding-right: 18px !important; }
        }
        @media (max-width: 600px) {
          .footer-inner { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }
          .footer-inner button { margin-left: 0 !important; }
        }
      `}</style>
    </div>
  );
}
