import { useState, useEffect } from 'react';
import { Timer } from 'lucide-react';
import { useEtaConfig } from '../hooks/useEta';
import { useUpdateSetting } from '../hooks/useSettings';
import { queryClient } from '../lib/queryClient';

/* Self-contained ETA / wait-time settings section. Manages its own state and
 * saves each control immediately via the settings mutation, independent of the
 * Settings page's autosave/dirty flow. */

function MiniToggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        flexShrink: 0, width: 40, height: 22, borderRadius: 11, border: 0,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        background: checked ? 'var(--ok)' : 'var(--line-2)',
        position: 'relative', transition: 'background .15s',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .15s',
      }} />
    </button>
  );
}

export default function EtaSettings() {
  const { data: cfg } = useEtaConfig();
  const updateSetting = useUpdateSetting();

  const [buffer, setBuffer]   = useState('');
  const [savingKey, setSaving] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (cfg && buffer === '') setBuffer(String(cfg.buffer ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);

  async function save(key, value) {
    setErr('');
    setSaving(key);
    try {
      await updateSetting.mutateAsync({ key, value });
      queryClient.invalidateQueries({ queryKey: ['eta-config'] });
    } catch (e) {
      setErr(e?.response?.data?.error || 'Could not save');
    } finally {
      setSaving('');
    }
  }

  // Rebuild the full overrides object from current config, applying one edit.
  async function saveOverride(category, raw) {
    const current = {};
    for (const w of cfg?.weights || []) {
      if (w.override != null) current[w.category] = w.override;
    }
    const trimmed = String(raw).trim();
    if (trimmed === '') delete current[category];
    else current[category] = Number(trimmed);
    await save('eta_category_overrides', JSON.stringify(current));
  }

  const enabled = !!cfg?.etaEnabled;
  const label = { fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 };
  const sub   = { fontSize: 11.5, color: 'var(--mute)', marginTop: 2 };

  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 18, marginBottom: 24 }}>
      {/* Master toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Timer size={13} style={{ color: 'var(--mute)', flexShrink: 0 }} />
          <div>
            <p style={label}>Wait-Time Estimates</p>
            <p style={sub}>
              Estimate how long walk-in guests wait for a table. Weights are learned automatically
              from completed sessions; you can fine-tune them below.
            </p>
          </div>
        </div>
        <MiniToggle checked={enabled} onChange={(v) => save('eta_enabled', String(v))} />
      </div>

      {enabled && (
        <div style={{ marginTop: 16, paddingLeft: 23 }}>
          {/* Buffer */}
          <div className="flex items-center justify-between gap-4" style={{ marginBottom: 14 }}>
            <div>
              <p style={label}>Buffer (minutes)</p>
              <p style={sub}>Padding added to every estimate to cover mid-meal ordering and other unknowns.</p>
            </div>
            <input
              type="number" min="0" max="120"
              value={buffer}
              onChange={(e) => setBuffer(e.target.value)}
              onBlur={() => { if (buffer !== '' && buffer !== String(cfg.buffer)) save('eta_buffer_minutes', buffer); }}
              className="input mono"
              style={{ width: 80, textAlign: 'right' }}
            />
          </div>

          {/* Extra chair */}
          <div className="flex items-center justify-between gap-4" style={{ marginBottom: 14 }}>
            <div>
              <p style={label}>Allow extra chair</p>
              <p style={sub}>Let a party be seated at a table one seat smaller (e.g. 3 guests at a 2-top) when they opt in.</p>
            </div>
            <MiniToggle checked={!!cfg?.allowExtraChair} onChange={(v) => save('allow_extra_chair', String(v))} />
          </div>

          {/* Reservation block */}
          <div className="flex items-center justify-between gap-4" style={{ marginBottom: 16 }}>
            <div>
              <p style={label}>Hold tables for reservations</p>
              <p style={sub}>Stop routing walk-ins to a table once a reservation is within one average sitting away.</p>
            </div>
            <MiniToggle checked={!!cfg?.reservationBlockEnabled} onChange={(v) => save('eta_reservation_block_enabled', String(v))} />
          </div>

          {/* Average table time readout */}
          <p style={{ ...sub, marginBottom: 12 }}>
            Average table time:{' '}
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{cfg?.avgTableTime} min</span>
            {' '}({cfg?.avgSampleCount > 0 ? `${cfg.avgSampleCount} session${cfg.avgSampleCount === 1 ? '' : 's'} learned` : 'using default until sessions accrue'})
          </p>

          {/* Category weights */}
          <p style={{ ...label, marginBottom: 6 }}>Category weights (minutes)</p>
          {(!cfg?.weights || cfg.weights.length === 0) ? (
            <p style={sub}>No categories yet — weights appear once your menu items have categories and sessions complete.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--mute)', textAlign: 'right' }}>
                    <th style={{ textAlign: 'left', fontWeight: 500, padding: '4px 8px' }}>Category</th>
                    <th style={{ fontWeight: 500, padding: '4px 8px' }}>Samples</th>
                    <th style={{ fontWeight: 500, padding: '4px 8px' }}>Seed</th>
                    <th style={{ fontWeight: 500, padding: '4px 8px' }}>Learned</th>
                    <th style={{ fontWeight: 500, padding: '4px 8px' }}>Effective</th>
                    <th style={{ fontWeight: 500, padding: '4px 8px' }}>Override</th>
                  </tr>
                </thead>
                <tbody>
                  {cfg.weights.map((w) => (
                    <tr key={w.category} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--ink)' }}>{w.category}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--mute)' }}>{w.samples}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--mute)' }}>{w.seed}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--mute)' }}>{w.learnedAvg ?? '—'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--ink)' }}>{w.effective}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                        <input
                          type="number" min="0" max="240"
                          defaultValue={w.override ?? ''}
                          placeholder="auto"
                          onBlur={(e) => {
                            const v = e.target.value;
                            if (String(v) !== String(w.override ?? '')) saveOverride(w.category, v);
                          }}
                          className="input mono"
                          style={{ width: 64, textAlign: 'right' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {savingKey && <p style={{ ...sub, color: 'var(--mute)' }}>Saving…</p>}
          {err && <p style={{ ...sub, color: 'var(--bad)' }}>{err}</p>}
        </div>
      )}
    </div>
  );
}
