import { useState, useEffect, useRef } from 'react';
import { Check, Globe, Clock, AlertCircle, Percent, Package, UserCheck, CalendarClock, ChevronDown, Search, Zap, RefreshCw, Gift, Banknote, Lock, LockOpen, MapPin } from 'lucide-react';
import { useCurrency } from '../context/CurrencyContext';
import { useTimezone } from '../context/TimezoneContext';
import { useSettings, useUpdateSetting } from '../hooks/useSettings';
import { useGeolocation } from '../hooks/useGeolocation';
import EtaSettings from '../components/EtaSettings';
import api from '../api/client';

/* ── Searchable dropdown ────────────────────────────────────── */

function SearchSelect({ triggerContent, items, onSelect, dropdownWidth = 320, disabled }) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState('');
  const rootRef  = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) { setQuery(''); return; }
    setTimeout(() => inputRef.current?.focus(), 0);
    function onDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const filtered = items.filter((item) => item.matches(query.toLowerCase()));

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center transition-colors"
        style={{
          height: 34, padding: '0 10px 0 12px', borderRadius: 8, gap: 8,
          border: open ? '1.5px solid var(--ink)' : '1px solid var(--line-2)',
          background: open ? 'var(--paper-2)' : 'var(--paper)',
          cursor: 'pointer', minWidth: 0,
        }}
      >
        {triggerContent}
        <ChevronDown size={13} style={{
          color: 'var(--mute)', flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s',
        }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0,
          width: dropdownWidth, zIndex: 100, borderRadius: 10,
          border: '1px solid var(--line-2)', background: 'var(--paper)',
          boxShadow: '0 8px 24px rgba(0,0,0,.10), 0 2px 6px rgba(0,0,0,.06)',
          overflow: 'hidden',
        }}>
          <div className="flex items-center gap-2 px-3" style={{ height: 38, borderBottom: '1px solid var(--line)' }}>
            <Search size={12} style={{ color: 'var(--mute)', flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', fontSize: 12, color: 'var(--ink)' }}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')}
                style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--mute)', lineHeight: 1 }}>
                ×
              </button>
            )}
          </div>
          <div style={{ maxHeight: 264, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--mute)' }}>No results</div>
            ) : filtered.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => { onSelect(item.key); setOpen(false); }}
                className="flex w-full items-center gap-3 text-left"
                style={{
                  padding: '7px 12px', border: 0, cursor: 'pointer',
                  borderBottom: '1px solid var(--line)',
                  background: item.selected ? 'var(--paper-2)' : 'transparent',
                }}
                onMouseEnter={(e) => { if (!item.selected) e.currentTarget.style.background = 'var(--hover)'; }}
                onMouseLeave={(e) => { if (!item.selected) e.currentTarget.style.background = 'transparent'; }}
              >
                {item.render()}
                {item.selected && <Check size={12} style={{ color: 'var(--ok)', flexShrink: 0, marginLeft: 'auto' }} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Toggle switch ──────────────────────────────────────────── */

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        flexShrink: 0, width: 40, height: 22, borderRadius: 11,
        border: 0, cursor: 'pointer',
        background: checked ? 'var(--ok)' : 'var(--line-2)',
        position: 'relative', transition: 'background .15s',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff', transition: 'left .15s',
      }} />
    </button>
  );
}

/* ── Section header ─────────────────────────────────────────── */

function SectionHead({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-3" style={{ borderTop: '1px solid var(--line)', paddingTop: 18 }}>
      <Icon size={13} style={{ color: 'var(--mute)', flexShrink: 0 }} />
      <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{title}</h2>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────── */

export default function Settings() {
  const { code, currency, setCurrency, currencies, format } = useCurrency();
  const { iana, setTimezone, timezones } = useTimezone();
  const updateSetting = useUpdateSetting();
  const { data: settings } = useSettings();

  const [fxRate,    setFxRate]    = useState(null);   // rate for current currency vs USD
  const [fxDate,    setFxDate]    = useState(null);   // date string from Frankfurter
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError,   setFxError]   = useState(false);

  const [saveError,       setSaveError]       = useState('');
  const [taxRate,         setTaxRate]         = useState('');
  const [serviceCharge,   setServiceCharge]   = useState('');
  const [dailyTarget,     setDailyTarget]     = useState('');
  const [packagingFee,    setPackagingFee]     = useState('');
  const [city,            setCity]             = useState('');
  const [latitude,        setLatitude]         = useState('');
  const [longitude,       setLongitude]        = useState('');
  const [locCapturedAt,   setLocCapturedAt]    = useState('');
  const [geoStatus,       setGeoStatus]        = useState('');
  const geo = useGeolocation();
  const [staffAssignment,   setStaffAssignment]   = useState(false);
  const [reservationsEnabled, setReservationsEnabled] = useState(false);
  const [loyaltyEnabled,      setLoyaltyEnabled]      = useState(false);
  const [loyaltyPointsPerUnit, setLoyaltyPointsPerUnit] = useState('');
  const [loyaltyPointsValue,   setLoyaltyPointsValue]   = useState('');
  const [denomInput,           setDenomInput]           = useState('');
  const [denomLocked,          setDenomLocked]          = useState(false);
  const [denomSaving,          setDenomSaving]          = useState(false);
  const [denomErr,             setDenomErr]             = useState('');
  const [saving,          setSaving]          = useState(false);
  const [saveErr,         setSaveErr]         = useState('');
  const [saved,           setSaved]           = useState(false);
  const [dirty,           setDirty]           = useState(false);

  const [autosave, setAutosave] = useState(
    () => localStorage.getItem('pos_autosave') === 'true',
  );

  const debounceRef = useRef(null);
  const saveRef     = useRef(null);

  /* Load from server */
  useEffect(() => {
    if (!settings) return;
    if (settings.tax_rate             !== undefined) setTaxRate(settings.tax_rate);
    if (settings.service_charge       !== undefined) setServiceCharge(settings.service_charge);
    if (settings.daily_revenue_target !== undefined) setDailyTarget(settings.daily_revenue_target || '');
    if (settings.packaging_fee  !== undefined) {
      const display = parseFloat(settings.packaging_fee || '0');
      setPackagingFee(display ? display.toFixed(currency.decimals ?? 2) : '');
    }
    if (settings.staff_assignment_enabled !== undefined) {
      setStaffAssignment(settings.staff_assignment_enabled === 'true');
    }
    if (settings.reservations_enabled !== undefined) {
      setReservationsEnabled(settings.reservations_enabled === 'true');
    }
    if (settings.loyalty_enabled !== undefined) {
      setLoyaltyEnabled(settings.loyalty_enabled === 'true');
    }
    if (settings.loyalty_points_per_unit !== undefined) setLoyaltyPointsPerUnit(settings.loyalty_points_per_unit || '');
    if (settings.loyalty_points_value    !== undefined) setLoyaltyPointsValue(settings.loyalty_points_value     || '');
    if (settings.cash_denominations !== undefined) {
      setDenomInput(settings.cash_denominations);
      setDenomLocked(true);
    }
    if (settings.city      !== undefined) setCity(settings.city || '');
    if (settings.latitude  !== undefined) setLatitude(settings.latitude || '');
    if (settings.longitude !== undefined) setLongitude(settings.longitude || '');
    if (settings.location_captured_at !== undefined) setLocCapturedAt(settings.location_captured_at || '');
    // mark clean after load so autosave doesn't fire on mount
    setTimeout(() => setDirty(false), 0);
  }, [settings]);

  /* Exchange rate — fetched via our backend (which caches + handles the
     upstream), with a local per-currency-per-day cache on top */
  async function fetchRate(currencyCode) {
    if (currencyCode === 'USD') { setFxRate(1); setFxDate(new Date().toISOString().slice(0, 10)); return; }
    const cacheKey = `pos_fx_${currencyCode}`;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (cached && cached.date === new Date().toISOString().slice(0, 10)) {
        setFxRate(cached.rate); setFxDate(cached.date); return;
      }
    } catch { /* bad cache */ }
    setFxLoading(true); setFxError(false);
    try {
      const { data } = await api.get('/settings/fx-rate', { params: { to: currencyCode } });
      const rate = data.rate;
      if (!rate) throw new Error('no rate');
      const date = data.date;
      localStorage.setItem(cacheKey, JSON.stringify({ rate, date }));
      setFxRate(rate); setFxDate(date);
    } catch {
      setFxError(true);
    } finally {
      setFxLoading(false);
    }
  }

  useEffect(() => { fetchRate(code); }, [code]);

  /* Save function — keep ref current so debounced calls always use latest state */
  async function doSave() {
    setSaveErr(''); setSaved(false); setSaving(true);
    try {
      await updateSetting.mutateAsync({ key: 'tax_rate',             value: taxRate       || '0' });
      await updateSetting.mutateAsync({ key: 'service_charge',       value: serviceCharge || '0' });
      await updateSetting.mutateAsync({ key: 'daily_revenue_target', value: dailyTarget });
      await updateSetting.mutateAsync({ key: 'packaging_fee',  value: parseFloat(packagingFee || '0').toFixed(4) });
      await updateSetting.mutateAsync({ key: 'city',      value: city.trim() });
      await updateSetting.mutateAsync({ key: 'latitude',  value: latitude  === '' ? '' : String(latitude) });
      await updateSetting.mutateAsync({ key: 'longitude', value: longitude === '' ? '' : String(longitude) });
      // Stamp/clear "set on" alongside the coordinates so the status stays truthful.
      await updateSetting.mutateAsync({ key: 'location_captured_at', value: (latitude === '' || longitude === '') ? '' : (locCapturedAt || '') });
      await updateSetting.mutateAsync({ key: 'staff_assignment_enabled', value: String(staffAssignment) });
      await updateSetting.mutateAsync({ key: 'reservations_enabled', value: String(reservationsEnabled) });
      await updateSetting.mutateAsync({ key: 'loyalty_enabled', value: String(loyaltyEnabled) });
      if (loyaltyEnabled) {
        if (loyaltyPointsPerUnit) await updateSetting.mutateAsync({ key: 'loyalty_points_per_unit', value: loyaltyPointsPerUnit });
        if (loyaltyPointsValue)   await updateSetting.mutateAsync({ key: 'loyalty_points_value',   value: loyaltyPointsValue });
      }
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveErr('Failed to save.');
    } finally {
      setSaving(false);
    }
  }
  saveRef.current = doSave;

  /* Autosave debounce — fires 900 ms after last change when autosave is on */
  useEffect(() => {
    if (!autosave || !dirty) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveRef.current?.(), 900);
    return () => clearTimeout(debounceRef.current);
  }, [taxRate, serviceCharge, packagingFee, city, latitude, longitude, staffAssignment, reservationsEnabled, loyaltyEnabled, loyaltyPointsPerUnit, loyaltyPointsValue, autosave, dirty]);

  function markDirty() { setDirty(true); }

  /* Fill latitude/longitude from the browser's geolocation (one tap) */
  function useMyLocation() {
    if (!navigator.geolocation) { setGeoStatus('Error: geolocation not supported on this device'); return; }
    setGeoStatus('Locating…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(4));
        setLongitude(pos.coords.longitude.toFixed(4));
        setLocCapturedAt(new Date().toISOString());
        markDirty();
        setGeoStatus(autosave ? 'Coordinates filled — saving…' : 'Coordinates filled — review and Save');
      },
      () => setGeoStatus('Error: could not get location (permission denied?)'),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  function toggleAutosave() {
    const next = !autosave;
    setAutosave(next);
    localStorage.setItem('pos_autosave', String(next));
  }

  /* Currency / timezone — always save immediately on selection */
  async function handleCurrencyChange(newCode) {
    setSaveError('');
    setCurrency(newCode);
    try {
      await updateSetting.mutateAsync({ key: 'currency', value: newCode });
    } catch {
      setSaveError('Failed to save currency — change is local only.');
    }
  }

  async function handleTimezoneChange(newIana) {
    setSaveError('');
    setTimezone(newIana);
    try {
      await updateSetting.mutateAsync({ key: 'timezone', value: newIana });
    } catch {
      setSaveError('Failed to save timezone — change is local only.');
    }
  }

  async function handleDenomLockToggle() {
    if (denomLocked) {
      setDenomErr('');
      setDenomLocked(false);
      return;
    }
    const parts = denomInput.split(',').map((s) => parseFloat(s.trim())).filter((n) => n > 0 && !isNaN(n));
    if (parts.length === 0) {
      setDenomErr('Enter at least one positive number.');
      return;
    }
    const normalized = parts.join(', ');
    setDenomErr(''); setDenomSaving(true);
    try {
      await updateSetting.mutateAsync({ key: 'cash_denominations', value: normalized });
      setDenomInput(normalized);
      setDenomLocked(true);
    } catch {
      setDenomErr('Failed to save.');
    } finally {
      setDenomSaving(false);
    }
  }

  /* Dropdown item builders */
  const currencyItems = Object.values(currencies).map((c) => ({
    key:      c.code,
    selected: c.code === code,
    matches:  (q) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    render:   () => (
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="mono num shrink-0" style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', width: 20, textAlign: 'center' }}>
          {c.symbol}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', flexShrink: 0 }}>{c.code}</span>
        <span className="truncate" style={{ fontSize: 11.5, color: 'var(--mute)' }}>{c.name}</span>
      </div>
    ),
  }));

  const tzItems = timezones.map((t) => ({
    key:      t.iana,
    selected: t.iana === iana,
    matches:  (q) => !q || t.label.toLowerCase().includes(q) || t.iana.toLowerCase().includes(q) || t.offset.toLowerCase().includes(q),
    render:   () => (
      <div className="flex items-center justify-between w-full min-w-0 gap-3">
        <div className="min-w-0">
          <p className="truncate" style={{ fontSize: 12, fontWeight: t.iana === iana ? 600 : 400, color: 'var(--ink)' }}>{t.label}</p>
          <p className="truncate" style={{ fontSize: 10.5, color: 'var(--mute)' }}>{t.iana}</p>
        </div>
        <span className="mono shrink-0" style={{ fontSize: 10.5, color: 'var(--mute)' }}>{t.offset}</span>
      </div>
    ),
  }));

  const selectedCurrency = currencies[code];
  const selectedTz       = timezones.find((t) => t.iana === iana);

  return (
    <div style={{ maxWidth: 560 }}>

      {saveError && (
        <div className="flex items-center gap-2 rounded-[6px] px-3 py-2 mb-5"
          style={{ fontSize: 12, color: 'var(--bad)', background: 'rgba(179,55,43,.06)', border: '1px solid rgba(179,55,43,.15)' }}>
          <AlertCircle size={13} style={{ flexShrink: 0 }} />
          {saveError}
        </div>
      )}

      {/* ── Currency ────────────────────────────────────────── */}
      <SectionHead icon={Globe} title="Display Currency" />
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <SearchSelect
          triggerContent={
            <span className="flex items-center gap-2" style={{ fontSize: 13 }}>
              <span className="mono num font-bold" style={{ color: 'var(--ink)' }}>{selectedCurrency?.symbol}</span>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{code}</span>
              <span style={{ color: 'var(--mute)' }}>—</span>
              <span style={{ color: 'var(--mute)' }}>{selectedCurrency?.name}</span>
            </span>
          }
          items={currencyItems}
          onSelect={handleCurrencyChange}
          dropdownWidth={300}
          disabled={updateSetting.isPending}
        />
      </div>

      {/* Exchange rate strip */}
      <div className="flex items-center gap-2 mb-5" style={{ fontSize: 12 }}>
        {fxLoading ? (
          <span style={{ color: 'var(--mute)' }}>Fetching rate…</span>
        ) : fxError ? (
          <span style={{ color: 'var(--bad)' }}>Could not fetch exchange rate</span>
        ) : fxRate != null && code !== 'USD' ? (<>
          <span style={{ color: 'var(--mute)' }}>
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>1 USD</span>
            {' = '}
            <span className="mono num" style={{ color: 'var(--ink)', fontWeight: 600 }}>
              {fxRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {code}
            </span>
          </span>
          {fxDate && (
            <span style={{ color: 'var(--mute-2)', fontSize: 11 }}>as of {fxDate}</span>
          )}
          <button
            type="button"
            title="Refresh rate"
            onClick={() => { localStorage.removeItem(`pos_fx_${code}`); fetchRate(code); }}
            style={{ background: 'none', border: 0, padding: 2, cursor: 'pointer', color: 'var(--mute)', lineHeight: 1 }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--ink)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--mute)'}
          >
            <RefreshCw size={11} />
          </button>
        </>) : null}
      </div>

      {/* ── Timezone ────────────────────────────────────────── */}
      <SectionHead icon={Clock} title="Timezone" />
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <SearchSelect
          triggerContent={
            <span className="flex items-center gap-2" style={{ fontSize: 13 }}>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{selectedTz?.label ?? iana}</span>
              <span className="mono" style={{ fontSize: 11.5, color: 'var(--mute)' }}>{selectedTz?.offset}</span>
            </span>
          }
          items={tzItems}
          onSelect={handleTimezoneChange}
          dropdownWidth={360}
          disabled={updateSetting.isPending}
        />
      </div>

      {/* ── Business Settings ───────────────────────────────── */}
      <SectionHead icon={Percent} title="Business Settings" />

      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--mute)', marginBottom: 4 }}>Tax Rate</label>
          <div className="flex items-center gap-1.5">
            <input type="number" min="0" max="100" step="0.01" value={taxRate}
              onChange={(e) => { setTaxRate(e.target.value); markDirty(); }}
              className="input mono" style={{ width: 80 }} placeholder="0" />
            <span style={{ fontSize: 12, color: 'var(--mute)' }}>%</span>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--mute)', marginBottom: 4 }}>Service Charge</label>
          <div className="flex items-center gap-1.5">
            <input type="number" min="0" max="100" step="0.01" value={serviceCharge}
              onChange={(e) => { setServiceCharge(e.target.value); markDirty(); }}
              className="input mono" style={{ width: 80 }} placeholder="0" />
            <span style={{ fontSize: 12, color: 'var(--mute)' }}>%</span>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--mute)', marginBottom: 4 }}>
            <span className="inline-flex items-center gap-1"><Package size={10} />Packaging Fee</span>
          </label>
          <div className="flex items-center gap-1.5">
            <input type="number" min="0" step="0.01" value={packagingFee}
              onChange={(e) => { setPackagingFee(e.target.value); markDirty(); }}
              className="input mono" style={{ width: 80 }} placeholder="0" />
            <span style={{ fontSize: 12, color: 'var(--mute)' }}>{currencies[code]?.symbol ?? '$'}</span>
          </div>
        </div>
      </div>

      <div className="mb-5">
        <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--mute)', marginBottom: 4 }}>Daily Revenue Target</label>
        <div className="flex items-center gap-1.5">
          <input type="number" min="0" step="1" value={dailyTarget}
            onChange={(e) => { setDailyTarget(e.target.value); markDirty(); }}
            className="input mono" style={{ width: 160 }} placeholder="e.g. 10000" />
          <span style={{ fontSize: 12, color: 'var(--mute)' }}>Shows progress bar on Overview</span>
        </div>
      </div>

      {/* ── Location ────────────────────────────────────────── */}
      <SectionHead icon={MapPin} title="Location" />
      <p style={{ fontSize: 11.5, color: 'var(--mute)', marginTop: -6, marginBottom: 10 }}>
        Used for weather-based waste insights. Set your outlet's city and coordinates.
      </p>
      <div className="flex flex-wrap items-end gap-3 mb-2">
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--mute)', marginBottom: 4 }}>City</label>
          <input type="text" value={city}
            onChange={(e) => { setCity(e.target.value); markDirty(); }}
            className="input" style={{ width: 180 }} placeholder="e.g. Bengaluru" maxLength={120} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--mute)', marginBottom: 4 }}>Latitude</label>
          <input type="number" step="any" min="-90" max="90" value={latitude}
            onChange={(e) => { setLatitude(e.target.value); setLocCapturedAt(new Date().toISOString()); markDirty(); }}
            className="input mono" style={{ width: 120 }} placeholder="12.9716" />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--mute)', marginBottom: 4 }}>Longitude</label>
          <input type="number" step="any" min="-180" max="180" value={longitude}
            onChange={(e) => { setLongitude(e.target.value); setLocCapturedAt(new Date().toISOString()); markDirty(); }}
            className="input mono" style={{ width: 120 }} placeholder="77.5946" />
        </div>
        <button type="button" onClick={useMyLocation} className="btn btn-sm" style={{ gap: 5, height: 34 }}>
          <MapPin size={12} /> Use my location
        </button>
      </div>
      {/* Saved-location status. The stored coordinates power weather insights
          server-side and are independent of the live browser permission, so a
          revoked permission is surfaced as a non-destructive note, never an auto-clear. */}
      {(() => {
        const hasCoords = latitude !== '' && longitude !== '';
        const setOn = locCapturedAt && !isNaN(Date.parse(locCapturedAt))
          ? new Date(locCapturedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
          : null;
        return (
          <div style={{ marginBottom: 18 }}>
            {hasCoords ? (
              <p style={{ fontSize: 11.5, color: 'var(--ok)', margin: 0 }}>
                ✓ Location saved: <span className="mono">{latitude}, {longitude}</span>
                {setOn && <span style={{ color: 'var(--mute)' }}> · set {setOn}</span>}
              </p>
            ) : (
              <p style={{ fontSize: 11.5, color: 'var(--mute)', margin: 0 }}>
                No location set — weather-based waste insights are disabled.
              </p>
            )}
            {geo.permission === 'denied' && (
              <p style={{ fontSize: 11.5, color: 'var(--mute)', marginTop: 4 }}>
                {hasCoords
                  ? 'Your browser is currently blocking location. The saved coordinates above are still used for weather — to update them, re-allow location (address-bar lock → Location) or edit the fields manually.'
                  : 'Location is blocked in your browser. Allow it, or enter coordinates manually above.'}
              </p>
            )}
            {geoStatus && (
              <p style={{ fontSize: 11.5, marginTop: 4, color: geoStatus.startsWith('Error') ? 'var(--bad)' : 'var(--mute)' }}>
                {geoStatus}
              </p>
            )}
          </div>
        );
      })()}

      {/* ── Staff Assignment ────────────────────────────────── */}
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 18, marginBottom: 24 }}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <UserCheck size={13} style={{ color: 'var(--mute)', flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Staff Assignment</p>
              <p style={{ fontSize: 11.5, color: 'var(--mute)', marginTop: 2 }}>
                Customers can enter a 4-digit staff PIN when ordering. Manage PINs in Users.
              </p>
            </div>
          </div>
          <Toggle
            checked={staffAssignment}
            onChange={(v) => { setStaffAssignment(v); markDirty(); }}
          />
        </div>
      </div>

      {/* ── Reservations ────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 18, marginBottom: 24 }}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <CalendarClock size={13} style={{ color: 'var(--mute)', flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Reservations</p>
              <p style={{ fontSize: 11.5, color: 'var(--mute)', marginTop: 2 }}>
                Allow tables to be reserved with guest name, party size, and arrival time.
              </p>
            </div>
          </div>
          <Toggle
            checked={reservationsEnabled}
            onChange={(v) => { setReservationsEnabled(v); markDirty(); }}
          />
        </div>
      </div>

      {/* ── Loyalty Programme ───────────────────────────────── */}
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 18, marginBottom: 24 }}>
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-2.5">
            <Gift size={13} style={{ color: 'var(--mute)', flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Loyalty Programme</p>
              <p style={{ fontSize: 11.5, color: 'var(--mute)', marginTop: 2 }}>
                Award points on purchases; customers redeem for discounts at checkout.
              </p>
            </div>
          </div>
          <Toggle
            checked={loyaltyEnabled}
            onChange={(v) => { setLoyaltyEnabled(v); markDirty(); }}
          />
        </div>
      </div>

      {/* ── Wait-Time Estimates (ETA) ───────────────────────── */}
      <EtaSettings />

      {/* ── Cash Denominations ──────────────────────────────── */}
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 18, marginBottom: 24 }}>
        <div className="flex items-center gap-2 mb-1">
          <Banknote size={13} style={{ color: 'var(--mute)', flexShrink: 0 }} />
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Cash Denominations</p>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--mute)', marginBottom: 10 }}>
          Comma-separated list of note/coin values shown on the Shift Count page. Largest first.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={denomInput}
            disabled={denomLocked}
            onChange={(e) => { setDenomInput(e.target.value); setDenomErr(''); }}
            placeholder="e.g. 500, 200, 100, 50, 20, 10, 5, 2, 1"
            className="input mono"
            style={{ flex: 1, minWidth: 220, opacity: denomLocked ? 0.6 : 1 }}
          />
          <button
            type="button"
            title={denomLocked ? 'Edit denominations' : 'Save and lock'}
            onClick={handleDenomLockToggle}
            disabled={denomSaving}
            style={{
              flexShrink: 0, width: 34, height: 34, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--line-2)', background: 'var(--paper)',
              cursor: denomSaving ? 'default' : 'pointer',
              color: denomLocked ? 'var(--mute)' : 'var(--ok)',
              opacity: denomSaving ? 0.5 : 1,
              transition: 'color .15s, border-color .15s',
            }}
            onMouseEnter={(e) => { if (!denomSaving) e.currentTarget.style.borderColor = 'var(--ink)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line-2)'; }}
          >
            {denomLocked ? <Lock size={14} /> : <LockOpen size={14} />}
          </button>
          {denomErr && (
            <span className="flex items-center gap-1" style={{ fontSize: 12, color: 'var(--bad)', flexShrink: 0 }}>
              <AlertCircle size={12} /> {denomErr}
            </span>
          )}
        </div>
      </div>

      {/* ── Bottom bar ──────────────────────────────────────── */}
      <div
        className="flex items-center justify-between gap-4 flex-wrap"
        style={{
          borderTop: '1px solid var(--line)',
          paddingTop: 16,
        }}
      >
        {/* Autosave toggle */}
        <button
          type="button"
          onClick={toggleAutosave}
          className="flex items-center gap-2 rounded-[6px] px-3 py-1.5 transition-colors"
          style={{
            fontSize: 12, fontWeight: 500,
            border: '1px solid var(--line-2)',
            background: autosave ? 'var(--paper-2)' : 'transparent',
            color: autosave ? 'var(--ink)' : 'var(--mute)',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { if (!autosave) { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)'; } }}
          onMouseLeave={(e) => { if (!autosave) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; } }}
        >
          <Zap size={12} style={{ color: autosave ? 'var(--ok)' : 'var(--mute-2)' }} />
          Autosave
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: autosave ? 'var(--ok)' : 'var(--mute-2)',
          }} />
        </button>

        {/* Status + Save button */}
        <div className="flex items-center gap-3">
          {saveErr && (
            <span className="flex items-center gap-1" style={{ fontSize: 12, color: 'var(--bad)' }}>
              <AlertCircle size={12} /> {saveErr}
            </span>
          )}
          {saving && (
            <span style={{ fontSize: 12, color: 'var(--mute)' }}>Saving…</span>
          )}
          {saved && !saving && (
            <span className="flex items-center gap-1" style={{ fontSize: 12, color: 'var(--ok)' }}>
              <Check size={12} /> Saved
            </span>
          )}
          {autosave && dirty && !saving && !saved && (
            <span style={{ fontSize: 11.5, color: 'var(--mute-2)' }}>Pending…</span>
          )}
          {!autosave && (
            <button
              onClick={() => saveRef.current?.()}
              disabled={saving}
              className="btn-primary disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          )}
        </div>
      </div>

    </div>
  );
}
