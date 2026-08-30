import { useMemo } from 'react';
import { ToggleLeft, Lock, Power } from 'lucide-react';
import { ALL_NAV } from '../components/Layout';
import { collectFeatureSections, parseFlags, PROTECTED_KEYS } from '../lib/features';
import { useSettings, useUpdateSetting } from '../hooks/useSettings';
import { CARD, LABEL } from '../lib/ui';

/**
 * Feature Toggles — switch whole modules of the app on or off for this restaurant.
 *
 * An operator who never uses, say, Market Intel or Forecasting can hide it: the
 * sidebar entry and the pages behind it disappear for their entire team, and a
 * typed URL to a switched-off page lands on an honest "turned off" notice. It is
 * per-restaurant and reversible — nothing is deleted, only hidden.
 *
 * The list is derived from the same nav the sidebar renders (ALL_NAV), so it can
 * never list a feature that doesn't exist or miss one that does. Core POS screens
 * and the admin screens you'd need to switch things back on are protected: they
 * show as always-on and carry no switch, so an admin can't lock themselves out.
 */

function Switch({ on, disabled, onChange, label }) {
  return (
    <button
      role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      onClick={() => !disabled && onChange(!on)}
      style={{
        flexShrink: 0, width: 38, height: 22, borderRadius: 999, border: 'none', padding: 0,
        cursor: disabled ? 'default' : 'pointer', position: 'relative',
        background: on ? 'var(--ok)' : 'var(--line-2)', opacity: disabled ? 0.45 : 1,
        transition: 'background .15s',
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: '50%',
        background: 'var(--paper)', boxShadow: '0 1px 2px rgba(0,0,0,.2)', transition: 'left .15s',
      }} />
    </button>
  );
}

export default function FeatureToggles() {
  const { data: settings } = useSettings();
  const update = useUpdateSetting();
  const flags = useMemo(() => parseFlags(settings), [settings]);

  const sections = useMemo(() => collectFeatureSections(ALL_NAV), []);

  // Every switchable (non-protected) leaf key — for the counts and the master switches.
  const toggleableKeys = useMemo(
    () => sections.flatMap((s) => s.items.filter((i) => !i.protected).map((i) => i.key)),
    [sections],
  );
  const onCount = toggleableKeys.filter((k) => flags[k] !== false).length;

  const save = (next) => update.mutate({ key: 'feature_flags', value: JSON.stringify(next) });

  const setFlag = (key, on) => {
    const next = { ...flags };
    if (on) delete next[key]; else next[key] = false; // store only the OFF overrides
    save(next);
  };

  const enableAll = () => save({});
  const disableAll = () => save(Object.fromEntries(toggleableKeys.map((k) => [k, false])));

  const isOn = (key) => flags[key] !== false;

  return (
    <div style={{ padding: '26px 24px 48px', maxWidth: 860, margin: '0 auto', display: 'grid', gap: 18 }}>
      <div>
        <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 999, background: 'var(--paper-3)', color: 'var(--mute)', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em' }}>
            <ToggleLeft size={12} strokeWidth={2.2} /> Admin · per restaurant
          </span>
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-.01em' }}>Feature Toggles</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink-2)', maxWidth: 720, lineHeight: 1.6 }}>
          Switch modules of the app off for your whole team when you don't use them. Turning a feature off
          hides it from the sidebar and its pages; nothing is deleted, and you can switch it back on any time.
        </p>
      </div>

      {/* Master controls */}
      <div style={{ ...CARD, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={LABEL}>Enabled</div>
          <div className="mono num" style={{ marginTop: 6, fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>
            {onCount} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--mute)' }}>of {toggleableKeys.length} switchable</span>
          </div>
        </div>
        <button onClick={enableAll} disabled={update.isPending}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 500, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)' }}>
          <Power size={13} /> Enable all
        </button>
        <button onClick={disableAll} disabled={update.isPending}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 500, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink-2)' }}>
          Disable all
        </button>
      </div>

      {/* Sections */}
      {sections.map((section) => {
        const groupOn = !section.groupKey || flags[section.groupKey] !== false;
        return (
          <div key={section.label} style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 16px', borderBottom: '1px solid var(--line)', background: 'var(--paper-2)' }}>
              <div style={{ ...LABEL, color: 'var(--ink-2)' }}>{section.label}</div>
              {section.groupKey && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>{groupOn ? 'Section on' : 'Section off'}</span>
                  <Switch on={groupOn} onChange={(v) => setFlag(section.groupKey, v)} label={`${section.label} section`} />
                </div>
              )}
            </div>
            <div>
              {section.items.map((item, i) => {
                const on = item.protected ? true : isOn(item.key);
                const dimmed = section.groupKey && !groupOn && !item.protected;
                return (
                  <div key={item.key} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                    opacity: dimmed ? 0.55 : 1,
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 7 }}>
                        {item.label}
                        {item.protected && <Lock size={11} strokeWidth={2.2} style={{ color: 'var(--mute)' }} />}
                      </div>
                      {item.protected ? (
                        <div style={{ marginTop: 2, fontSize: 11.5, color: 'var(--mute)' }}>Core feature — always on</div>
                      ) : dimmed ? (
                        <div style={{ marginTop: 2, fontSize: 11.5, color: 'var(--mute)' }}>Hidden while the section is off</div>
                      ) : null}
                    </div>
                    <Switch on={on} disabled={item.protected} onChange={(v) => setFlag(item.key, v)} label={item.label} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <p style={{ margin: 0, fontSize: 12, color: 'var(--mute)', lineHeight: 1.6 }}>
        Toggles apply to every user in this restaurant. They hide features in the operator app; they do not
        change billing or delete any data. Core POS screens and admin settings stay on so you always have a
        way back here.
      </p>
    </div>
  );
}
