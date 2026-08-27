import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HexColorPicker } from 'react-colorful';
import settingsOptions from '@shared/settings-options.json';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Check, X, Trash2, UserPlus, ImagePlus, RotateCcw, PowerOff, Power, Palette, Download, Upload, ChevronDown, Sparkles, LayoutGrid } from 'lucide-react';
import {
  useRestaurant,
  useUpdateRestaurant,
  useCreateUser,
  useDeleteUser,
  useUpdateSetting,
  useUploadLogo,
  useDeleteLogo,
  useSetRestaurantStatus,
  useSetRestaurantAi,
  useRegenerateTableTokens,
} from '../hooks/useAdmin';

// ── Colour helpers ────────────────────────────────────────────────────────────

function hexLuminance(hex) {
  try {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  } catch { return 0; }
}

function contrastOn(hex) {
  return hexLuminance(hex) > 0.179 ? '#0A0A0A' : '#FFFFFF';
}

// Returns hex + 2-char alpha suffix for translucent tints
function hexTint(hex, alpha) {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}

// ── ColorPickerPopover ────────────────────────────────────────────────────────
// Rendered via portal so it's never clipped by the modal's overflow:hidden.
// Positioned next to the swatch using fixed coordinates, clamped to viewport.

function ColorPickerPopover({ color, onChange, anchorEl, onClose }) {
  const popRef  = useRef(null);
  const [hex, setHex] = useState(color);

  // Keep local hex in sync when parent resets to default
  useEffect(() => { setHex(color); }, [color]);

  // Close on outside mousedown (but not when clicking the anchor swatch itself)
  useEffect(() => {
    function handle(e) {
      if (!popRef.current?.contains(e.target) && !anchorEl?.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [anchorEl, onClose]);

  // Compute fixed position anchored below the swatch, clamped to viewport
  const PW = 228, PH = 300;
  const rect = anchorEl?.getBoundingClientRect() ?? { top: 0, left: 0, bottom: 40, right: 40 };
  let left = rect.left;
  let top  = rect.bottom + 8;
  if (left + PW > window.innerWidth  - 12) left = rect.right  - PW;
  if (left < 12)                           left = 12;
  if (top  + PH > window.innerHeight - 12) top  = rect.top    - PH - 8;
  if (top  < 12)                           top  = 12;

  function handleHexInput(e) {
    let v = e.target.value;
    if (!v.startsWith('#')) v = '#' + v;
    v = '#' + v.slice(1).replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
    setHex(v);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
  }

  const safeColor = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#000000';

  return createPortal(
    <div
      ref={popRef}
      style={{
        position: 'fixed', top, left, zIndex: 9999,
        background: 'var(--paper)',
        border: '1px solid var(--line-2)',
        borderRadius: 12, padding: 14,
        boxShadow: '0 8px 32px rgba(0,0,0,.20), 0 2px 8px rgba(0,0,0,.10)',
        width: PW,
      }}
    >
      <HexColorPicker
        color={safeColor}
        onChange={(c) => { setHex(c); onChange(c); }}
        style={{ width: '100%' }}
      />
      <input
        type="text"
        value={hex}
        onChange={handleHexInput}
        spellCheck={false}
        autoComplete="off"
        style={{
          marginTop: 10, width: '100%', boxSizing: 'border-box',
          fontFamily: 'monospace', fontSize: 13, letterSpacing: '.05em', textTransform: 'uppercase',
          border: '1px solid var(--line-2)', borderRadius: 6,
          padding: '6px 10px', background: 'var(--paper-2)', color: 'var(--ink)',
          outline: 'none', transition: 'border-color .1s',
        }}
        onFocus={(e)  => (e.target.style.borderColor = 'var(--ink)')}
        onBlur={(e)   => (e.target.style.borderColor = 'var(--line-2)')}
      />
    </div>,
    document.body,
  );
}

// ── ColorRow ──────────────────────────────────────────────────────────────────

function ColorRow({ label, description, value, onChange, defaultHex, isLast }) {
  const swatchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const display  = value || defaultHex;
  const isCustom = !!value;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px',
        borderBottom: isLast ? 'none' : '1px solid var(--line)',
      }}
    >
      {/* Swatch — toggles the picker popover */}
      <button
        ref={swatchRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Pick colour"
        style={{
          width: 28, height: 28, borderRadius: 6, flexShrink: 0,
          background: display,
          border: '1.5px solid rgba(0,0,0,.15)',
          cursor: 'pointer', padding: 0,
          boxShadow: '0 1px 3px rgba(0,0,0,.10)',
          transition: 'transform .1s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      />

      {open && (
        <ColorPickerPopover
          color={display}
          onChange={onChange}
          anchorEl={swatchRef.current}
          onClose={() => setOpen(false)}
        />
      )}

      {/* Label + description */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{label}</p>
        {description && (
          <p style={{ margin: 0, fontSize: 11, color: 'var(--mute)', marginTop: 1 }}>{description}</p>
        )}
      </div>

      {/* Hex value */}
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: isCustom ? 'var(--ink)' : 'var(--mute-2)', letterSpacing: '.04em', flexShrink: 0, minWidth: 56, textAlign: 'right' }}>
        {display}
      </span>

      {/* Per-colour reset */}
      <button
        onClick={() => { onChange(''); setOpen(false); }}
        disabled={!isCustom}
        title="Reset to default"
        style={{
          flexShrink: 0, width: 20, height: 20, borderRadius: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', cursor: isCustom ? 'pointer' : 'default',
          color: isCustom ? 'var(--mute)' : 'transparent',
          transition: 'color .1s',
        }}
        onMouseEnter={(e) => { if (isCustom) e.currentTarget.style.color = 'var(--bad)'; }}
        onMouseLeave={(e) => { if (isCustom) e.currentTarget.style.color = 'var(--mute)'; }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

// ── SmallColorPicker — inline swatch+popover used in the Logo section ────────

function SmallColorPicker({ label, description, value, onChange, defaultHex }) {
  const swatchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const display  = value || defaultHex;
  const isCustom = !!value;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{label}</p>
        {description && <p style={{ margin: '1px 0 0', fontSize: 11, color: 'var(--mute)' }}>{description}</p>}
      </div>
      <button
        ref={swatchRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Pick colour"
        style={{
          width: 28, height: 28, borderRadius: 6, flexShrink: 0,
          background: display, border: '1.5px solid rgba(0,0,0,.15)',
          cursor: 'pointer', padding: 0,
          boxShadow: '0 1px 3px rgba(0,0,0,.10)', transition: 'transform .1s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      />
      {open && (
        <ColorPickerPopover
          color={display}
          onChange={onChange}
          anchorEl={swatchRef.current}
          onClose={() => setOpen(false)}
        />
      )}
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: isCustom ? 'var(--ink)' : 'var(--mute-2)', letterSpacing: '.04em', flexShrink: 0, minWidth: 52 }}>
        {display}
      </span>
      <button
        onClick={() => { onChange(''); setOpen(false); }}
        disabled={!isCustom}
        title="Reset to default"
        style={{
          flexShrink: 0, width: 18, height: 18, borderRadius: 3,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', cursor: isCustom ? 'pointer' : 'default',
          color: isCustom ? 'var(--mute)' : 'transparent', transition: 'color .1s',
        }}
        onMouseEnter={(e) => { if (isCustom) e.currentTarget.style.color = 'var(--bad)'; }}
        onMouseLeave={(e) => { if (isCustom) e.currentTarget.style.color = 'var(--mute)'; }}
      >
        <X size={11} />
      </button>
    </div>
  );
}

// ── Group heading inside the left panel ───────────────────────────────────────

function GroupHeading({ label }) {
  return (
    <div style={{
      padding: '8px 16px 5px',
      borderBottom: '1px solid var(--line)',
      background: 'var(--paper-2)',
    }}>
      <p style={{ margin: 0, fontSize: 9.5, fontWeight: 700, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.09em' }}>
        {label}
      </p>
    </div>
  );
}

// ── Rich preview ──────────────────────────────────────────────────────────────

function RichPreview({ p, logoUrl, logoBg }) {
  return (
    <div style={{
      border: `1px solid ${p.line2}`,
      borderRadius: 10, overflow: 'hidden',
      display: 'flex', height: 260,
      boxShadow: '0 4px 16px rgba(0,0,0,.10)',
    }}>
      {/* Sidebar */}
      <div style={{
        width: 52, background: p.sidebarBg,
        borderRight: `1px solid ${p.line}`,
        display: 'flex', flexDirection: 'column',
        padding: '10px 7px', gap: 5,
        flexShrink: 0,
      }}>
        {/* Logo or accent square */}
        {logoUrl ? (
          <div style={{ width: 22, height: 22, borderRadius: 3, flexShrink: 0, background: logoBg || 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <img src={logoUrl} alt="" referrerPolicy="no-referrer" style={{ maxWidth: 20, maxHeight: 20, objectFit: 'contain' }} />
          </div>
        ) : (
          <div style={{ width: 22, height: 22, borderRadius: 5, background: p.accent }} />
        )}
        {/* Active nav item */}
        <div style={{ height: 22, borderRadius: 5, background: p.paper2, display: 'flex', alignItems: 'center', paddingLeft: 5, gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: p.accent, flexShrink: 0 }} />
          <div style={{ height: 2.5, width: '60%', borderRadius: 2, background: p.ink, opacity: 0.8 }} />
        </div>
        {/* Inactive nav items */}
        {[0.75, 0.55, 0.65, 0.45, 0.7].map((w, i) => (
          <div key={i} style={{ height: 20, borderRadius: 5, display: 'flex', alignItems: 'center', paddingLeft: 5, gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: p.mute, opacity: 0.35, flexShrink: 0 }} />
            <div style={{ height: 2.5, borderRadius: 2, background: p.mute, opacity: 0.3, width: `${w * 100}%` }} />
          </div>
        ))}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, background: p.pageBg, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Topbar */}
        <div style={{
          height: 36, borderBottom: `1px solid ${p.line}`,
          background: p.pageBg,
          display: 'flex', alignItems: 'center', paddingInline: 12, gap: 8,
          flexShrink: 0,
        }}>
          <div style={{ height: 3, width: 48, borderRadius: 2, background: p.ink }} />
          <div style={{ height: 3, width: 36, borderRadius: 2, background: p.mute }} />
          <div style={{ marginLeft: 'auto', height: 20, paddingInline: 9, borderRadius: 5, background: p.accent, display: 'inline-flex', alignItems: 'center' }}>
            <div style={{ width: 22, height: 2.5, borderRadius: 2, background: p.accentOn }} />
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7, overflow: 'hidden' }}>
          {/* Stat cards row */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[p.ok, p.info, p.warn, p.bad].map((color, i) => (
              <div key={i} style={{
                flex: 1, height: 36, borderRadius: 6,
                background: hexTint(color, 0.10),
                border: `1px solid ${hexTint(color, 0.22)}`,
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center',
                padding: '0 7px', gap: 3,
              }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
                <div style={{ height: 2, width: '55%', borderRadius: 1, background: color, opacity: 0.6 }} />
              </div>
            ))}
          </div>

          {/* Table */}
          <div style={{ border: `1px solid ${p.line2}`, borderRadius: 7, overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{
              background: p.paper3, height: 20,
              borderBottom: `1px solid ${p.line}`,
              display: 'flex', alignItems: 'center', paddingInline: 9, gap: 10,
            }}>
              {[38, 28, 22].map((w, i) => (
                <div key={i} style={{ height: 2, width: w, borderRadius: 1, background: p.mute2, ...(i === 2 ? { marginLeft: 'auto' } : {}) }} />
              ))}
            </div>
            {/* Data rows */}
            {[[52, 24, 28], [40, 28, 24], [46, 20, 32]].map((widths, r) => (
              <div key={r} style={{
                height: 20, borderBottom: r < 2 ? `1px solid ${p.line}` : 'none',
                display: 'flex', alignItems: 'center', paddingInline: 9, gap: 10,
              }}>
                {widths.map((w, i) => (
                  <div key={i} style={{ height: 2, width: w, borderRadius: 1, background: i === 0 ? p.ink : p.mute, opacity: i === 0 ? 0.75 : 0.45, ...(i === 2 ? { marginLeft: 'auto' } : {}) }} />
                ))}
              </div>
            ))}
          </div>

          {/* Card with text */}
          <div style={{ border: `1px solid ${p.line}`, borderRadius: 7, padding: '8px 10px', background: p.paper2 }}>
            <div style={{ height: 2.5, width: '50%', borderRadius: 1, background: p.ink, opacity: 0.75, marginBottom: 5 }} />
            <div style={{ height: 2, width: '70%', borderRadius: 1, background: p.mute, opacity: 0.5, marginBottom: 3 }} />
            <div style={{ height: 2, width: '55%', borderRadius: 1, background: p.mute2, opacity: 0.4 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ChartPreview — SVG bar + multi-series line chart using live draft colours ─

function ChartPreview({ p }) {
  // All coordinates live inside a viewBox with 3 px padding on every side so
  // strokes at the edges are never clipped by the SVG viewport.
  const W   = 280;
  const PAD = 3; // inner padding so nothing touches the SVG edge

  // ── Bar chart ───────────────────────────────────────────────────────────────
  const BAR_DATA  = [38, 62, 48, 75, 53, 68, 44, 58];
  const BAR_INNER = 64; // usable drawing height inside PAD
  const BAR_VB_H  = BAR_INNER + PAD * 2;
  const n         = BAR_DATA.length;
  const barW      = Math.floor((W - (n - 1) * 5) / n);
  const maxBar    = Math.max(...BAR_DATA);

  // ── Multi-series line chart ─────────────────────────────────────────────────
  const LINE_INNER = 52;
  const LINE_VB_H  = LINE_INNER + PAD * 2;
  const SERIES = [
    { color: p.ok,   values: [28, 42, 35, 55, 40, 58, 48, 62] },
    { color: p.info, values: [48, 36, 52, 40, 56, 32, 46, 38] },
    { color: p.warn, values: [18, 30, 22, 38, 28, 44, 32, 40] },
    { color: p.bad,  values: [32, 24, 40, 28, 36, 20, 30, 26] },
  ];
  const maxLine = Math.max(...SERIES.flatMap((s) => s.values));
  const xStep   = W / (SERIES[0].values.length - 1);

  // All y values are offset by PAD so they sit inside the padded area
  function pts(values) {
    return values
      .map((v, i) => `${(i * xStep).toFixed(1)},${(PAD + LINE_INNER - (v / maxLine) * LINE_INNER).toFixed(1)}`)
      .join(' ');
  }

  return (
    <div style={{ border: `1px solid ${p.line2}`, borderRadius: 8, padding: '12px 14px', background: p.pageBg }}>
      <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 700, color: p.mute, textTransform: 'uppercase', letterSpacing: '.08em' }}>
        Charts
      </p>

      {/* Bar chart — viewBox adds PAD on every side so bars & axis line stay inside */}
      <svg
        width="100%"
        height={BAR_VB_H}
        viewBox={`0 0 ${W} ${BAR_VB_H}`}
        preserveAspectRatio="none"
        style={{ display: 'block' }}
      >
        {/* Grid lines inside padded area */}
        {[0.33, 0.67, 1].map((t, i) => {
          const y = PAD + BAR_INNER - t * BAR_INNER;
          return <line key={i} x1={0} x2={W} y1={y} y2={y} stroke={p.line} strokeWidth={1} />;
        })}
        {/* Bars */}
        {BAR_DATA.map((v, i) => {
          const h = Math.max(2, (v / maxBar) * BAR_INNER);
          const y = PAD + BAR_INNER - h;
          return (
            <rect key={i} x={i * (barW + 5)} y={y} width={barW} height={h}
              fill={p.ink} opacity={0.82} rx={2} />
          );
        })}
        {/* Axis line */}
        <line x1={0} x2={W} y1={PAD + BAR_INNER} y2={PAD + BAR_INNER} stroke={p.line2} strokeWidth={1} />
      </svg>

      <div style={{ height: 1, background: p.line, margin: '8px 0' }} />

      {/* Multi-series line chart */}
      <svg
        width="100%"
        height={LINE_VB_H}
        viewBox={`0 0 ${W} ${LINE_VB_H}`}
        preserveAspectRatio="none"
        style={{ display: 'block' }}
      >
        {[0.33, 0.67, 1].map((t, i) => {
          const y = PAD + LINE_INNER - t * LINE_INNER;
          return <line key={i} x1={0} x2={W} y1={y} y2={y} stroke={p.line} strokeWidth={1} />;
        })}
        {SERIES.map(({ color, values }, si) => (
          <polyline key={si} points={pts(values)} fill="none"
            stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
        ))}
        <line x1={0} x2={W} y1={PAD + LINE_INNER} y2={PAD + LINE_INNER} stroke={p.line2} strokeWidth={1} />
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 8 }}>
        {[
          { color: p.ok,   label: 'Success' },
          { color: p.info, label: 'Info' },
          { color: p.warn, label: 'Warning' },
          { color: p.bad,  label: 'Danger' },
        ].map(({ color, label }) => (
          <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 14, height: 2.5, borderRadius: 2, background: color, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: p.mute }}>{label}</span>
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: p.ink, display: 'inline-block', opacity: 0.82, flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: p.mute }}>Bars</span>
        </span>
      </div>
    </div>
  );
}

// ── BrandingModal ─────────────────────────────────────────────────────────────

function BrandingModal({ restaurantId, settings, onClose }) {
  const updateSetting = useUpdateSetting(restaurantId);
  const uploadLogo    = useUploadLogo(restaurantId);
  const deleteLogo    = useDeleteLogo(restaurantId);
  const [saving,     setSaving]      = useState(false);
  const [uploadErr,  setUploadErr]   = useState('');
  const [logoUrl,    setLogoUrlInput] = useState('');
  const [showImport, setShowImport]  = useState(false);

  // ── Draft colour state — init from saved settings, discarded on Cancel ──────
  const s = settings;
  const [primary,   setPrimary]   = useState(s.theme_primary    || '');
  const [accentOn,  setAccentOn]  = useState(s.theme_accent_on  || '');
  const [pageBg,    setPageBg]    = useState(s.theme_page_bg    || '');
  const [paper2,    setPaper2]    = useState(s.theme_paper_2    || '');
  const [paper3,    setPaper3]    = useState(s.theme_paper_3    || '');
  const [sidebarBg, setSidebarBg] = useState(s.theme_sidebar_bg || '');
  const [ink,       setInk]       = useState(s.theme_ink        || '');
  const [ink2,      setInk2]      = useState(s.theme_ink_2      || '');
  const [mute,      setMute]      = useState(s.theme_mute       || '');
  const [mute2,     setMute2]     = useState(s.theme_mute_2     || '');
  const [line,      setLine]      = useState(s.theme_line       || '');
  const [line2,     setLine2]     = useState(s.theme_line_2     || '');
  const [ok,        setOk]        = useState(s.theme_ok         || '');
  const [warn,      setWarn]      = useState(s.theme_warn       || '');
  const [bad,       setBad]       = useState(s.theme_bad        || '');
  const [info,      setInfo]      = useState(s.theme_info       || '');
  const [logoBg,    setLogoBg]    = useState(s.theme_logo_bg    || '');

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const currentLogoUrl = s.theme_logo_url || '';

  // ── Effective (preview) values ────────────────────────────────────────────
  const p = {
    accent:    primary    || '#0A0A0A',
    accentOn:  accentOn   || contrastOn(primary || '#0A0A0A'),
    pageBg:    pageBg     || '#FAFAF8',
    paper2:    paper2     || '#F4F3EE',
    paper3:    paper3     || '#ECEAE3',
    sidebarBg: sidebarBg  || pageBg || '#FAFAF8',
    ink:       ink        || '#0A0A0A',
    ink2:      ink2       || '#2A2A28',
    mute:      mute       || '#6E6D67',
    mute2:     mute2      || '#9B9A92',
    line:      line       || '#E8E6E0',
    line2:     line2      || '#D4D0C8',
    ok:        ok         || '#1f8a5b',
    warn:      warn       || '#b3781f',
    bad:       bad        || '#b3372b',
    info:      info       || '#1f5bb3',
  };

  // ── Logo handlers ─────────────────────────────────────────────────────────
  async function handleLogoFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadErr('');
    try { await uploadLogo.mutateAsync(file); } catch (err) {
      setUploadErr(err.response?.data?.error || 'Upload failed');
    }
    e.target.value = '';
  }

  async function handleLogoUrl(e) {
    e.preventDefault();
    const url = logoUrl.trim();
    if (!url) return;
    await updateSetting.mutateAsync({ key: 'theme_logo_url', value: url });
    setLogoUrlInput('');
  }

  // ── Colour save / reset ───────────────────────────────────────────────────
  const COLOR_KEYS = [
    ['theme_primary',    primary],   ['theme_accent_on',  accentOn],
    ['theme_page_bg',    pageBg],    ['theme_paper_2',    paper2],
    ['theme_paper_3',    paper3],    ['theme_sidebar_bg', sidebarBg],
    ['theme_ink',        ink],       ['theme_ink_2',      ink2],
    ['theme_mute',       mute],      ['theme_mute_2',     mute2],
    ['theme_line',       line],      ['theme_line_2',     line2],
    ['theme_ok',         ok],        ['theme_warn',       warn],
    ['theme_bad',        bad],       ['theme_info',       info],
    ['theme_logo_bg',    logoBg],
  ];

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.all(COLOR_KEYS.map(([key, value]) => updateSetting.mutateAsync({ key, value })));
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setPrimary(''); setAccentOn('');
    setPageBg('');  setPaper2('');  setPaper3('');  setSidebarBg('');
    setInk('');     setInk2('');    setMute('');     setMute2('');
    setLine('');    setLine2('');
    setOk('');      setWarn('');    setBad('');      setInfo('');
    setLogoBg('');
    setSaving(true);
    try {
      await Promise.all(COLOR_KEYS.map(([key]) => updateSetting.mutateAsync({ key, value: '' })));
    } finally {
      setSaving(false);
    }
  }

  function handleExport() {
    // Use p (effective = draft if set, otherwise default) so the file is never empty.
    const data = {
      theme_primary:    p.accent,
      theme_accent_on:  p.accentOn,
      theme_page_bg:    p.pageBg,
      theme_paper_2:    p.paper2,
      theme_paper_3:    p.paper3,
      theme_sidebar_bg: p.sidebarBg,
      theme_ink:        p.ink,
      theme_ink_2:      p.ink2,
      theme_mute:       p.mute,
      theme_mute_2:     p.mute2,
      theme_line:       p.line,
      theme_line_2:     p.line2,
      theme_ok:         p.ok,
      theme_warn:       p.warn,
      theme_bad:        p.bad,
      theme_info:       p.info,
      ...(logoBg          && { theme_logo_bg:  logoBg }),
      ...(currentLogoUrl  && { theme_logo_url: currentLogoUrl }),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'branding.json'; a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(data) {
    const apply = (key, setter) => { if (key in data) setter(data[key] || ''); };
    apply('theme_primary',    setPrimary);
    apply('theme_accent_on',  setAccentOn);
    apply('theme_page_bg',    setPageBg);
    apply('theme_paper_2',    setPaper2);
    apply('theme_paper_3',    setPaper3);
    apply('theme_sidebar_bg', setSidebarBg);
    apply('theme_ink',        setInk);
    apply('theme_ink_2',      setInk2);
    apply('theme_mute',       setMute);
    apply('theme_mute_2',     setMute2);
    apply('theme_line',       setLine);
    apply('theme_line_2',     setLine2);
    apply('theme_ok',         setOk);
    apply('theme_warn',       setWarn);
    apply('theme_bad',        setBad);
    apply('theme_info',       setInfo);
    apply('theme_logo_bg',    setLogoBg);
    // theme_logo_url is an immediate DB write — not a draft field; skip silently
  }

  // ── Colour group definitions ──────────────────────────────────────────────
  const GROUPS = [
    {
      label: 'Brand',
      rows: [
        { label: 'Accent',          description: 'Buttons, active nav, highlights', value: primary,   onChange: setPrimary,   defaultHex: '#0A0A0A' },
        { label: 'Text on accent',  description: 'Text inside primary buttons',     value: accentOn,  onChange: setAccentOn,  defaultHex: contrastOn(p.accent), isLast: true },
      ],
    },
    {
      label: 'Surfaces',
      rows: [
        { label: 'Page background',   description: 'Main content area',     value: pageBg,  onChange: setPageBg,  defaultHex: '#FAFAF8' },
        { label: 'Secondary surface', description: 'Cards, nav active bg',  value: paper2,  onChange: setPaper2,  defaultHex: '#F4F3EE' },
        { label: 'Tertiary surface',  description: 'Table headers, strips', value: paper3,  onChange: setPaper3,  defaultHex: '#ECEAE3', isLast: true },
      ],
    },
    {
      label: 'Navigation',
      rows: [
        { label: 'Sidebar background', description: 'Navigation panel bg', value: sidebarBg, onChange: setSidebarBg, defaultHex: p.pageBg, isLast: true },
      ],
    },
    {
      label: 'Text',
      rows: [
        { label: 'Primary text',   description: 'Headings, values',    value: ink,   onChange: setInk,   defaultHex: '#0A0A0A' },
        { label: 'Secondary text', description: 'Subheadings, labels', value: ink2,  onChange: setInk2,  defaultHex: '#2A2A28' },
        { label: 'Muted text',     description: 'Hints, captions',     value: mute,  onChange: setMute,  defaultHex: '#6E6D67' },
        { label: 'Faint text',     description: 'Placeholders',        value: mute2, onChange: setMute2, defaultHex: '#9B9A92', isLast: true },
      ],
    },
    {
      label: 'Borders',
      rows: [
        { label: 'Subtle border', description: 'Row dividers, separators', value: line,  onChange: setLine,  defaultHex: '#E8E6E0' },
        { label: 'Strong border', description: 'Card outlines, inputs',    value: line2, onChange: setLine2, defaultHex: '#D4D0C8', isLast: true },
      ],
    },
    {
      label: 'Status',
      rows: [
        { label: 'Success', description: 'Completed, served',   value: ok,   onChange: setOk,   defaultHex: '#1f8a5b' },
        { label: 'Warning', description: 'Preparing, alerts',   value: warn, onChange: setWarn, defaultHex: '#b3781f' },
        { label: 'Danger',  description: 'Errors, cancellations', value: bad,  onChange: setBad,  defaultHex: '#b3372b' },
        { label: 'Info',    description: 'Ready, informational', value: info, onChange: setInfo, defaultHex: '#1f5bb3', isLast: true },
      ],
    },
  ];

  return (
    <>
    {createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      style={{ background: 'rgba(10,10,10,.32)' }}
      onClick={onClose}
    >
      <div
        className="flex w-full flex-col rounded-[12px]"
        style={{
          background: 'var(--paper)',
          border: '1px solid var(--line)',
          maxWidth: 860,
          height: 'min(calc(100dvh - 24px), 740px)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex h-12 shrink-0 items-center justify-between px-5"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Branding</span>
          <button
            onClick={onClose}
            className="rounded-md p-1 transition-colors"
            style={{ color: 'var(--mute)', background: 'transparent', border: 0, cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; }}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Left — scrollable colour controls */}
          <div
            className="flex-1 overflow-y-auto scrollbar-none min-w-0"
            style={{ borderRight: '1px solid var(--line)' }}
          >
            {/* Logo section */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }} className="space-y-3">
              <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Logo</p>

              {currentLogoUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ border: '1px solid var(--line)', borderRadius: 7, padding: '8px 12px', background: logoBg || 'var(--paper-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 56, minHeight: 44 }}>
                    <img src={currentLogoUrl} alt="Logo" referrerPolicy="no-referrer" style={{ maxHeight: 32, maxWidth: 100, objectFit: 'contain' }} />
                  </div>
                  <div className="space-y-1.5" style={{ flex: 1 }}>
                    <label className="btn btn-sm" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                      <ImagePlus size={12} /> Replace file
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: 'none' }} onChange={handleLogoFile} />
                    </label>
                    <button className="btn btn-sm" onClick={() => deleteLogo.mutate()} disabled={deleteLogo.isPending} style={{ color: 'var(--bad)', display: 'flex' }}>
                      <Trash2 size={12} /> {deleteLogo.isPending ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                </div>
              ) : (
                <label style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                  border: '1.5px dashed var(--line-2)', borderRadius: 7, padding: '14px 20px',
                  cursor: 'pointer', transition: 'border-color .1s, background .1s',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--ink)'; e.currentTarget.style.background = 'var(--hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line-2)'; e.currentTarget.style.background = 'transparent'; }}
                >
                  <ImagePlus size={18} style={{ color: 'var(--mute-2)' }} />
                  <span style={{ fontSize: 12, color: 'var(--mute)', fontWeight: 500 }}>Upload a file</span>
                  <span style={{ fontSize: 11, color: 'var(--mute-2)' }}>PNG · JPG · WebP · max 2 MB</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: 'none' }} onChange={handleLogoFile} />
                </label>
              )}

              <form onSubmit={handleLogoUrl}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--mute-2)', pointerEvents: 'none', fontFamily: 'monospace' }}>URL</span>
                    <input type="text" value={logoUrl} onChange={(e) => setLogoUrlInput(e.target.value)} placeholder="https://example.com/logo.png" className="input" style={{ paddingLeft: 36, fontSize: 12 }} />
                  </div>
                  <button type="submit" className="btn btn-sm" disabled={!logoUrl.trim() || saving}>Apply</button>
                </div>
              </form>

              {uploadLogo.isPending && <p style={{ fontSize: 11, color: 'var(--mute)', margin: 0 }}>Uploading…</p>}
              {uploadErr && <p style={{ fontSize: 11, color: 'var(--bad)', margin: 0 }}>{uploadErr}</p>}

              <div style={{ paddingTop: 2, borderTop: '1px solid var(--line)', marginTop: 4 }}>
                <SmallColorPicker
                  label="Logo background"
                  description="Fill behind transparent PNGs"
                  value={logoBg}
                  onChange={setLogoBg}
                  defaultHex="#FFFFFF"
                />
              </div>
            </div>

            {/* Colour groups */}
            {GROUPS.map((group) => (
              <div key={group.label}>
                <GroupHeading label={group.label} />
                {group.rows.map((row, i) => (
                  <ColorRow
                    key={row.label}
                    label={row.label}
                    description={row.description}
                    value={row.value}
                    onChange={row.onChange}
                    defaultHex={row.defaultHex}
                    isLast={i === group.rows.length - 1}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Right — scrollable preview pane */}
          <div
            className="hidden sm:flex shrink-0 flex-col gap-4 overflow-y-auto scrollbar-none"
            style={{ width: 340, padding: '16px 18px' }}
          >
            <div>
              <p style={{ margin: '0 0 9px', fontSize: 10, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Live Preview</p>
              <RichPreview p={p} logoUrl={currentLogoUrl} logoBg={logoBg || undefined} />
            </div>

            <ChartPreview p={p} />

            {/* Swatch summary */}
            <div style={{ border: '1px solid var(--line)', borderRadius: 7, padding: '12px 14px', background: 'var(--paper-2)' }}>
              <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Summary</p>
              <div className="space-y-2.5">
                {[
                  { label: 'Logo bg',    swatches: [logoBg || '#FFFFFF'] },
                  { label: 'Brand',      swatches: [p.accent, p.accentOn] },
                  { label: 'Surfaces',   swatches: [p.pageBg, p.paper2, p.paper3] },
                  { label: 'Navigation', swatches: [p.sidebarBg] },
                  { label: 'Text',       swatches: [p.ink, p.ink2, p.mute, p.mute2] },
                  { label: 'Borders',    swatches: [p.line, p.line2] },
                  { label: 'Status',     swatches: [p.ok, p.warn, p.bad, p.info] },
                ].map(({ label, swatches }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span style={{ fontSize: 11, color: 'var(--mute)', width: 68, flexShrink: 0 }}>{label}</span>
                    <div className="flex gap-1.5">
                      {swatches.map((hex, i) => (
                        <div key={i} title={hex} style={{
                          width: 15, height: 15, borderRadius: 3, background: hex,
                          border: '1px solid rgba(0,0,0,.12)',
                        }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="shrink-0 flex flex-wrap items-center gap-2 px-5 py-3"
          style={{ borderTop: '1px solid var(--line)' }}
        >
          <button className="btn-secondary flex items-center gap-2" onClick={handleReset} disabled={saving}>
            <RotateCcw size={13} /> Reset all
          </button>
          <button className="btn-secondary flex items-center gap-2" onClick={handleExport}>
            <Download size={13} /> Export
          </button>
          <button className="btn-secondary flex items-center gap-2" onClick={() => setShowImport(true)}>
            <Upload size={13} /> Import
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save branding'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
    )}
    {showImport && <ImportModal onImport={handleImport} onClose={() => setShowImport(false)} />}
    </>
  );
}

// ── ImportModal ───────────────────────────────────────────────────────────────

const FORMAT_GUIDE = `{
  // Brand
  "theme_primary":    "#0A0A0A",   // accent — buttons, active nav
  "theme_accent_on":  "#FAFAF8",   // text on accent buttons

  // Surfaces
  "theme_page_bg":    "#FAFAF8",   // main content background
  "theme_paper_2":    "#F4F3EE",   // cards, secondary surfaces
  "theme_paper_3":    "#ECEAE3",   // table headers, strips

  // Navigation
  "theme_sidebar_bg": "#FAFAF8",   // sidebar panel

  // Text
  "theme_ink":        "#0A0A0A",   // primary text
  "theme_ink_2":      "#2A2A28",   // secondary text
  "theme_mute":       "#6E6D67",   // muted / hints
  "theme_mute_2":     "#9B9A92",   // faint / placeholders

  // Borders
  "theme_line":       "#E8E6E0",   // subtle dividers
  "theme_line_2":     "#D4D0C8",   // card outlines, inputs

  // Status (also controls chart line colours)
  "theme_ok":         "#1f8a5b",   // success / completed
  "theme_warn":       "#b3781f",   // warning / preparing
  "theme_bad":        "#b3372b",   // danger / errors
  "theme_info":       "#1f5bb3",   // info / ready

  // Logo
  "theme_logo_bg":    "#FFFFFF",   // background behind logo image
  "theme_logo_url":   "https://example.com/logo.png"
}`;

function ImportModal({ onImport, onClose }) {
  const [error,      setError]      = useState('');
  const [showGuide,  setShowGuide]  = useState(false);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (typeof data !== 'object' || Array.isArray(data) || data === null) {
          setError('File must contain a JSON object { … }.');
          return;
        }
        onImport(data);
        onClose();
      } catch {
        setError('Could not parse file — make sure it is valid JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(10,10,10,.45)' }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--paper)', border: '1px solid var(--line)',
          borderRadius: 10, maxWidth: 480, width: '100%',
          display: 'flex', flexDirection: 'column',
          maxHeight: 'min(calc(100dvh - 32px), 680px)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — fixed */}
        <div className="flex h-12 shrink-0 items-center justify-between px-5"
          style={{ borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Import branding</span>
          <button
            onClick={onClose}
            className="rounded-md p-1 transition-colors"
            style={{ color: 'var(--mute)', background: 'transparent', border: 0, cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="scrollbar-none space-y-4 overflow-y-auto px-5 py-4">
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.55 }}>
            Upload a <code style={{ fontSize: 11.5, background: 'var(--paper-2)', padding: '1px 5px', borderRadius: 3, color: 'var(--ink)' }}>.json</code> file
            previously exported from this panel, or hand-write one following the format below.
            Values are loaded into the draft — nothing is saved until you click <strong style={{ color: 'var(--ink)' }}>Save branding</strong>.
          </p>

          {/* Collapsible format guide */}
          <div style={{ border: '1px solid var(--line)', borderRadius: 7, overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setShowGuide((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-2.5 transition-colors"
              style={{ background: 'var(--paper-2)', border: 0, cursor: 'pointer', fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--paper-2)')}
            >
              <span>Expected format &amp; all valid keys</span>
              <ChevronDown size={13} style={{ color: 'var(--mute)', transition: 'transform .15s', transform: showGuide ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </button>
            {showGuide && (
              <div style={{ borderTop: '1px solid var(--line)', background: 'var(--paper-2)', padding: '12px 16px' }}>
                <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--mute)' }}>
                  All keys are optional. Omit a key to leave it unchanged. Set a value to{' '}
                  <code style={{ fontSize: 10.5, background: 'var(--paper)', padding: '1px 4px', borderRadius: 3 }}>&quot;&quot;</code>{' '}
                  to reset it to the default. Colour values must be 6-digit hex (<code style={{ fontSize: 10.5, background: 'var(--paper)', padding: '1px 4px', borderRadius: 3 }}>#rrggbb</code>).
                </p>
                <pre style={{
                  margin: 0, fontSize: 10.5, fontFamily: 'monospace', color: 'var(--ink)',
                  background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 6,
                  padding: '10px 12px', lineHeight: 1.75,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {FORMAT_GUIDE}
                </pre>
              </div>
            )}
          </div>

          {/* Drop zone */}
          <label style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
            border: '1.5px dashed var(--line-2)', borderRadius: 7, padding: '18px 20px',
            cursor: 'pointer', transition: 'border-color .1s, background .1s',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--ink)'; e.currentTarget.style.background = 'var(--hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line-2)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <Upload size={18} style={{ color: 'var(--mute-2)' }} />
            <span style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 500 }}>Choose a .json file</span>
            <span style={{ fontSize: 11, color: 'var(--mute-2)' }}>Changes load into draft · review before saving</span>
            <input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={handleFile} />
          </label>

          {error && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--bad)', background: 'rgba(179,55,43,.06)', borderRadius: 6, padding: '8px 12px' }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── BrandingButton — trigger card ─────────────────────────────────────────────

function BrandingButton({ settings, onOpen }) {
  const s = settings;
  const accent    = s.theme_primary    || '#0A0A0A';
  const pageBg    = s.theme_page_bg    || '#FAFAF8';
  const sidebarBg = s.theme_sidebar_bg || pageBg;
  const logoUrl   = s.theme_logo_url   || '';

  const logoBg  = s.theme_logo_bg || '';

  const customCount = [
    s.theme_primary, s.theme_accent_on, s.theme_page_bg, s.theme_paper_2, s.theme_paper_3,
    s.theme_sidebar_bg, s.theme_ink, s.theme_ink_2, s.theme_mute, s.theme_mute_2,
    s.theme_line, s.theme_line_2, s.theme_ok, s.theme_warn, s.theme_bad, s.theme_info,
    s.theme_logo_bg,
  ].filter(Boolean).length;

  // Mini preview using saved values
  const savedP = {
    accent, accentOn: s.theme_accent_on || contrastOn(accent),
    pageBg, paper2: s.theme_paper_2 || '#F4F3EE', paper3: s.theme_paper_3 || '#ECEAE3',
    sidebarBg, ink: s.theme_ink || '#0A0A0A', ink2: s.theme_ink_2 || '#2A2A28',
    mute: s.theme_mute || '#6E6D67', mute2: s.theme_mute_2 || '#9B9A92',
    line: s.theme_line || '#E8E6E0', line2: s.theme_line_2 || '#D4D0C8',
    ok: s.theme_ok || '#1f8a5b', warn: s.theme_warn || '#b3781f',
    bad: s.theme_bad || '#b3372b', info: s.theme_info || '#1f5bb3',
  };

  return (
    <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--paper)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>Branding</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--mute)' }}>
            {customCount > 0 ? `${customCount} custom colour${customCount !== 1 ? 's' : ''}` : 'Default theme'}
          </p>
        </div>
        <button onClick={onOpen} className="flex items-center gap-1.5 btn btn-sm" style={{ fontSize: 12, flexShrink: 0 }}>
          <Palette size={13} /> Edit
        </button>
      </div>

      {/* Mini preview */}
      <div style={{ padding: '12px 14px' }}>
        <RichPreview p={savedP} logoUrl={logoUrl} logoBg={logoBg || undefined} />
      </div>
    </div>
  );
}

// ── Misc components ───────────────────────────────────────────────────────────

const ROLE_DOT = {
  admin:   'var(--info)',
  staff:   'var(--mute)',
  kitchen: 'var(--warn)',
};

function ConfirmDeleteUserModal({ user, onConfirm, onClose, isPending }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,10,10,.45)' }} onClick={onClose}>
      <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 10, padding: 24, maxWidth: 360, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>Remove user?</p>
        <p style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 20 }}>
          <strong style={{ color: 'var(--ink)' }}>{user.email}</strong> will lose access to this restaurant immediately.
        </p>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={onConfirm} disabled={isPending} className="flex-1 rounded-[6px] px-4 py-2 disabled:opacity-60" style={{ fontSize: 13, fontWeight: 500, background: 'var(--bad)', color: '#fff', border: 0, cursor: 'pointer' }}>
            {isPending ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StatusBadge({ isActive }) {
  return (
    <span className="inline-flex items-center gap-1" style={{ fontSize: 11, fontWeight: 500, borderRadius: 4, padding: '2px 7px', background: isActive ? 'rgba(41,163,97,.10)' : 'rgba(179,120,31,.10)', color: isActive ? 'var(--ok)' : 'var(--warn)' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
      {isActive ? 'Active' : 'Suspended'}
    </span>
  );
}

const { timezones: TIMEZONES, currencies: CURRENCIES } = settingsOptions;

function SettingsCard({ restaurantId, settings }) {
  const updateSetting = useUpdateSetting(restaurantId);
  const [tz,    setTz]    = useState(settings.timezone       || 'UTC');
  const [cur,   setCur]   = useState(settings.currency       || 'USD');
  const [tax,   setTax]   = useState(settings.tax_rate       || '0');
  const [svc,   setSvc]   = useState(settings.service_charge || '0');
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    await Promise.all([
      updateSetting.mutateAsync({ key: 'timezone',       value: tz }),
      updateSetting.mutateAsync({ key: 'currency',       value: cur }),
      updateSetting.mutateAsync({ key: 'tax_rate',       value: tax }),
      updateSetting.mutateAsync({ key: 'service_charge', value: svc }),
    ]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--paper)', padding: 20 }} className="space-y-4">
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Settings</p>
      <div>
        <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>Timezone</label>
        <select className="input" value={tz} onChange={(e) => setTz(e.target.value)}>
          {TIMEZONES.map((zone) => <option key={zone.iana} value={zone.iana}>{zone.label} ({zone.offset})</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>Currency</label>
        <select className="input" value={cur} onChange={(e) => setCur(e.target.value)}>
          {CURRENCIES.map(({ code, name }) => <option key={code} value={code}>{code} — {name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>Tax rate (%)</label>
          <input type="number" min="0" max="100" step="0.01" className="input" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>Service charge (%)</label>
          <input type="number" min="0" max="100" step="0.01" className="input" value={svc} onChange={(e) => setSvc(e.target.value)} placeholder="0" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={handleSave} disabled={updateSetting.isPending} className="btn-primary w-full disabled:opacity-50">
          {saved ? 'Saved!' : updateSetting.isPending ? 'Saving…' : 'Save settings'}
        </button>
        {saved && <Check size={14} style={{ color: 'var(--ok)', flexShrink: 0 }} />}
      </div>
    </div>
  );
}

function AiAssistantCard({ restaurantId, enabled }) {
  const setAi = useSetRestaurantAi();

  return (
    <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--paper)', padding: 20 }}>
      <div className="flex items-center justify-between gap-3">
        <div style={{ minWidth: 0 }}>
          <p className="flex items-center gap-1.5" style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
            <Sparkles size={13} /> AI Assistant
          </p>
          <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--mute)', lineHeight: 1.45 }}>
            {enabled
              ? 'Chat assistant is available to this restaurant’s staff.'
              : 'Hidden from this restaurant — chat requests are rejected.'}
          </p>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          title={enabled ? 'Disable AI assistant' : 'Enable AI assistant'}
          onClick={() => setAi.mutate({ id: restaurantId, ai_enabled: !enabled })}
          disabled={setAi.isPending}
          style={{
            width: 36, height: 20, borderRadius: 999, border: 0, padding: 0, flexShrink: 0,
            background: enabled ? 'var(--ok)' : 'var(--line-2)',
            position: 'relative', cursor: 'pointer', transition: 'background .15s',
            opacity: setAi.isPending ? 0.6 : 1,
          }}
        >
          <span style={{
            position: 'absolute', top: 2, left: enabled ? 18 : 2,
            width: 16, height: 16, borderRadius: '50%', background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'left .15s',
          }} />
        </button>
      </div>
    </div>
  );
}

function ConfirmRegenerateModal({ tableCount, onConfirm, onClose, isPending }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,10,10,.45)' }} onClick={onClose}>
      <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 10, padding: 24, maxWidth: 400, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>Regenerate all QR codes?</p>
        <p style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 6, lineHeight: 1.55 }}>
          All <strong style={{ color: 'var(--ink)' }}>{tableCount}</strong> table{tableCount !== 1 ? 's' : ''} will get a brand-new QR token.
        </p>
        <p style={{ fontSize: 12, color: 'var(--warn)', marginBottom: 20, lineHeight: 1.5 }}>
          Every printed QR code for this restaurant stops working immediately and must be reprinted from its dashboard.
        </p>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={onConfirm} disabled={isPending} className="flex-1 rounded-[6px] px-4 py-2 disabled:opacity-60" style={{ fontSize: 13, fontWeight: 500, background: 'var(--warn)', color: '#fff', border: 0, cursor: 'pointer' }}>
            {isPending ? 'Regenerating…' : 'Regenerate'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TablesQrCard({ restaurantId, tableCount }) {
  const regenerate = useRegenerateTableTokens(restaurantId);
  const [confirm, setConfirm] = useState(false);
  const [done,    setDone]    = useState(null);

  async function handleRegenerate() {
    const res = await regenerate.mutateAsync();
    setConfirm(false);
    setDone(res.count);
    setTimeout(() => setDone(null), 6000);
  }

  return (
    <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--paper)', padding: 20 }}>
      <div className="flex items-center justify-between gap-3">
        <div style={{ minWidth: 0 }}>
          <p className="flex items-center gap-1.5" style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
            <LayoutGrid size={13} /> Tables
          </p>
          <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--mute)' }}>
            {tableCount} table{tableCount !== 1 ? 's' : ''} configured
          </p>
        </div>
        <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>{tableCount}</span>
      </div>

      <div style={{ borderTop: '1px solid var(--line)', marginTop: 14, paddingTop: 14 }}>
        <button
          onClick={() => setConfirm(true)}
          disabled={tableCount === 0 || regenerate.isPending}
          className="btn btn-sm flex w-full items-center justify-center gap-1.5 disabled:opacity-50"
          style={{ fontSize: 12 }}
        >
          <RotateCcw size={12} /> {regenerate.isPending ? 'Regenerating…' : 'Regenerate QR codes'}
        </button>
        {done != null ? (
          <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--ok)', lineHeight: 1.45 }}>
            New tokens issued for {done} table{done !== 1 ? 's' : ''}. Old QR codes are now invalid — reprint them from the restaurant’s dashboard.
          </p>
        ) : (
          <p style={{ margin: '8px 0 0', fontSize: 10.5, color: 'var(--mute-2)', lineHeight: 1.45 }}>
            Issues a fresh QR token for every table. Use this if a QR has leaked — existing printed codes will then need reprinting.
          </p>
        )}
      </div>

      {confirm && (
        <ConfirmRegenerateModal
          tableCount={tableCount}
          onConfirm={handleRegenerate}
          onClose={() => setConfirm(false)}
          isPending={regenerate.isPending}
        />
      )}
    </div>
  );
}

function AddUserForm({ restaurantId, onClose }) {
  const createUser = useCreateUser(restaurantId);
  const [form, setForm] = useState({ email: '', password: '', role: 'staff' });
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await createUser.mutateAsync(form);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="pt-4 mt-4 space-y-3" style={{ borderTop: '1px solid var(--line)' }}>
      <p style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink)' }}>Add user</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input className="input" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
        <input className="input" type="password" placeholder="Password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} minLength={6} required />
      </div>
      <select className="input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
        <option value="admin">Admin</option>
        <option value="staff">Staff</option>
        <option value="kitchen">Kitchen</option>
      </select>
      {error && <p style={{ fontSize: 12, color: 'var(--bad)' }}>{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={createUser.isPending} className="btn-primary">{createUser.isPending ? 'Adding…' : 'Add user'}</button>
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
      </div>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RestaurantDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useRestaurant(id);
  const updateRestaurant = useUpdateRestaurant(id);
  const deleteUser       = useDeleteUser(id);
  const setStatus        = useSetRestaurantStatus();

  const [editing,        setEditing]        = useState(false);
  const [nameVal,        setNameVal]        = useState('');
  const [showAddUser,    setShowAddUser]    = useState(false);
  const [confirmDelUser, setConfirmDelUser] = useState(null);
  const [showBranding,   setShowBranding]  = useState(false);

  function startEdit() { setNameVal(data.name); setEditing(true); }

  async function saveName() {
    if (!nameVal.trim()) return;
    await updateRestaurant.mutateAsync(nameVal.trim());
    setEditing(false);
  }

  async function handleToggleStatus() {
    await setStatus.mutateAsync({ id, is_active: !data.is_active });
  }

  async function handleDeleteUser() {
    await deleteUser.mutateAsync(confirmDelUser.id);
    setConfirmDelUser(null);
  }

  if (isLoading) return <div className="p-8" style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</div>;
  if (!data)     return <div className="p-8" style={{ fontSize: 13, color: 'var(--bad)' }}>Restaurant not found.</div>;

  const isActive = data.is_active !== false;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <button onClick={() => navigate('/')} className="flex items-center gap-1.5 transition-colors" style={{ fontSize: 13, color: 'var(--mute)', background: 'transparent', border: 0, cursor: 'pointer' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--mute)')}
      >
        <ArrowLeft size={14} /> Restaurants
      </button>

      {/* Name heading */}
      <div className="flex flex-wrap items-center gap-3">
        {editing ? (
          <>
            <input className="input" style={{ fontSize: 18, fontWeight: 700, maxWidth: 320 }} value={nameVal} onChange={(e) => setNameVal(e.target.value)} autoFocus />
            <button onClick={saveName} className="btn btn-sm btn-ghost" style={{ color: 'var(--ok)' }}><Check size={18} /></button>
            <button onClick={() => setEditing(false)} className="btn btn-sm btn-ghost"><X size={18} /></button>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>{data.name}</h1>
            <button onClick={startEdit} className="btn btn-sm btn-ghost"
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--mute)')}
            >
              <Pencil size={14} />
            </button>
            <StatusBadge isActive={isActive} />
            <button onClick={handleToggleStatus} disabled={setStatus.isPending} className="flex items-center gap-1.5 btn btn-sm" style={{ fontSize: 12, color: isActive ? 'var(--warn)' : 'var(--ok)' }} title={isActive ? 'Suspend restaurant' : 'Reactivate restaurant'}>
              {isActive ? <PowerOff size={12} /> : <Power size={12} />}
              {setStatus.isPending ? '…' : isActive ? 'Suspend' : 'Reactivate'}
            </button>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Settings + Branding button */}
        <div className="lg:col-span-1 space-y-5">
          <SettingsCard restaurantId={id} settings={data.settings} />
          <TablesQrCard restaurantId={id} tableCount={data.table_count ?? 0} />
          <AiAssistantCard restaurantId={id} enabled={data.ai_enabled !== false} />
          <BrandingButton settings={data.settings} onOpen={() => setShowBranding(true)} />
        </div>

        {/* Users */}
        <div className="lg:col-span-2">
          <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--paper)', padding: 20 }}>
            <div className="flex items-center justify-between mb-4">
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
                Users <span style={{ marginLeft: 6, fontWeight: 400, color: 'var(--mute)' }}>({data.users.length})</span>
              </p>
              <button onClick={() => setShowAddUser((v) => !v)} className="flex items-center gap-1.5 transition-colors" style={{ fontSize: 12, fontWeight: 500, color: 'var(--mute)', background: 'transparent', border: 0, cursor: 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--mute)')}
              >
                <UserPlus size={13} /> Add user
              </button>
            </div>

            {data.users.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--mute)' }}>No users yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full" style={{ minWidth: 400, fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)' }}>
                      {['Email', 'Role', 'Joined', ''].map((h, i) => (
                        <th key={i} className={`pb-2 ${i === 3 ? '' : 'text-left'}`} style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((u) => (
                      <tr key={u.id} style={{ borderBottom: '1px solid var(--line)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td className="py-2.5" style={{ color: 'var(--ink)' }}>{u.email}</td>
                        <td className="py-2.5">
                          <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)', textTransform: 'capitalize' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: ROLE_DOT[u.role] ?? 'var(--mute)' }} />
                            {u.role}
                          </span>
                        </td>
                        <td className="py-2.5" style={{ fontSize: 11.5, color: 'var(--mute)' }}>{new Date(u.created_at).toLocaleDateString()}</td>
                        <td className="py-2.5 text-right">
                          <button onClick={() => setConfirmDelUser(u)} className="btn btn-sm btn-ghost" style={{ color: 'var(--bad)' }}>
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {showAddUser && <AddUserForm restaurantId={id} onClose={() => setShowAddUser(false)} />}
          </div>
        </div>
      </div>

      {showBranding && (
        <BrandingModal restaurantId={id} settings={data.settings} onClose={() => setShowBranding(false)} />
      )}

      {confirmDelUser && (
        <ConfirmDeleteUserModal user={confirmDelUser} onConfirm={handleDeleteUser} onClose={() => setConfirmDelUser(null)} isPending={deleteUser.isPending} />
      )}
    </div>
  );
}
