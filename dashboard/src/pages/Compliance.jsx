import { useState } from 'react';
import { ShieldCheck, AlertTriangle, Check, FileText, CalendarClock, Plus } from 'lucide-react';
import {
  useComplianceOverview, useEvidencePack, useHygiene, useShiftChecklists,
  useSubmitHygiene, useSubmitShift, useSaveLicence, useSaveCert, useRecordTest,
} from '../hooks/useCompliance';

/**
 * Compliance — licence, certificates, checklists, testing calendar, evidence pack.
 *
 * The rule that shapes every state here: **'unknown' is not 'valid'.** A record
 * with no expiry date on file is shown in its own colour and rolls up as
 * "can't tell", never as a pass. An audit view that renders a missing document
 * as green is worse than no audit view.
 */

const TABS = [
  { key: 'overview',  label: 'Overview' },
  { key: 'hygiene',   label: 'Hygiene' },
  { key: 'shifts',    label: 'Shift sign-offs' },
  { key: 'testing',   label: 'Testing' },
  { key: 'records',   label: 'Records' },
  { key: 'evidence',  label: 'Evidence pack' },
];

const STATE_TONE = {
  valid:    { color: 'var(--ok)',   bg: 'var(--ok-soft)',   label: 'Valid' },
  expiring: { color: 'var(--warn)', bg: 'var(--warn-soft)', label: 'Expiring' },
  expired:  { color: 'var(--bad)',  bg: 'var(--bad-soft)',  label: 'Expired' },
  unknown:  { color: 'var(--mute)', bg: 'var(--hover)',     label: 'No date on file' },
  ok:       { color: 'var(--ok)',   bg: 'var(--ok-soft)',   label: 'On schedule' },
  due_soon: { color: 'var(--warn)', bg: 'var(--warn-soft)', label: 'Due soon' },
  overdue:  { color: 'var(--bad)',  bg: 'var(--bad-soft)',  label: 'Overdue' },
  never:    { color: 'var(--mute)', bg: 'var(--hover)',     label: 'Never recorded' },
};

const SEVERITY_TONE = {
  critical: 'var(--bad)', high: 'var(--bad)', medium: 'var(--warn)', low: 'var(--mute)',
};

const btn = (primary = false) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '6px 11px', borderRadius: 7, cursor: 'pointer',
  fontSize: 12.5, fontWeight: 500,
  border: `1px solid ${primary ? 'var(--ink)' : 'var(--line-2)'}`,
  background: primary ? 'var(--ink)' : 'transparent',
  color: primary ? 'var(--paper)' : 'var(--ink)',
});

const input = {
  padding: '6px 9px', borderRadius: 7, border: '1px solid var(--line-2)',
  background: 'var(--paper)', color: 'var(--ink)', fontSize: 13,
};

function Pill({ state }) {
  const tone = STATE_TONE[state] || STATE_TONE.unknown;
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 999, background: tone.bg, color: tone.color,
      fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em',
      whiteSpace: 'nowrap',
    }}>{tone.label}</span>
  );
}

// Camera-based hygiene monitoring is a recognised future line, not a built
// feature: it needs ceiling cameras and a trained CV model that no deployment
// runs today. It used to sit in the nav as four empty "Kitchen Watch" shells;
// those were removed, and this note keeps the intent visible where it belongs —
// beside the hygiene checks it would one day automate — without pretending a
// screen exists. Anything it would report is a station-level rate, never a
// person.
const CAMERA_MONITORS = [
  ['Headgear & glove checks', 'Uncovered hair or bare hands at prep stations, as a daily rate.'],
  ['Handwash cadence', 'Handwash events per station per shift against the agreed interval.'],
  ['Spill & pest detection', 'Floor spills, blocked walkways and pest activity, while still cleanable.'],
  ['Cross-contamination alerts', 'A warning when an allergen risk appears at a shared prep station.'],
];

function CameraMonitoringNote() {
  return (
    <div style={{
      marginTop: 22, padding: '13px 15px', borderRadius: 10,
      border: '1px dashed var(--line-2)', background: 'var(--hover)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <ShieldCheck size={14} style={{ color: 'var(--mute)' }} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Camera hygiene monitoring</span>
        <span style={{
          padding: '1px 7px', borderRadius: 999, background: 'var(--paper-2)',
          color: 'var(--mute)', fontSize: 9, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '.06em',
        }}>Future</span>
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--mute)', lineHeight: 1.5 }}>
        Needs ceiling cameras and a trained computer-vision model in the kitchen — not installed,
        so this stays a plan rather than a screen. It would report station-level rates, never a
        person.
      </p>
      {CAMERA_MONITORS.map(([title, desc]) => (
        <div key={title} style={{ display: 'flex', gap: 8, padding: '3px 0', fontSize: 12 }}>
          <span style={{ color: 'var(--mute)' }}>◦</span>
          <span><strong style={{ fontWeight: 600 }}>{title}</strong> — <span style={{ color: 'var(--mute)' }}>{desc}</span></span>
        </div>
      ))}
    </div>
  );
}

function ChecklistForm({ items, existing, onSubmit, busy, label }) {
  const [checked, setChecked] = useState([]);
  const [signedBy, setSignedBy] = useState('');

  if (existing) {
    return (
      <div style={{ padding: '13px 15px', border: '1px solid var(--line)', borderRadius: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5 }}>
          <Check size={15} strokeWidth={2.4} style={{ color: 'var(--ok)' }} />
          <strong>{label} signed off</strong>
          <span style={{ color: 'var(--mute)' }}>by {existing.signedBy}</span>
        </div>
        {existing.missed.length > 0 && (
          <div style={{ marginTop: 9 }}>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--bad)' }}>
              {existing.missed.length} item{existing.missed.length === 1 ? '' : 's'} not passed:
            </p>
            {existing.missed.map((m) => (
              <div key={m.id} style={{ fontSize: 12.5, color: 'var(--mute)', padding: '1px 0' }}>· {m.label}</div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const toggle = (id) =>
    setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <div style={{ padding: '13px 15px', border: '1px solid var(--line)', borderRadius: 10 }}>
      {items.map((item) => (
        <label key={item.id} style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0',
          fontSize: 13, cursor: 'pointer', color: 'var(--ink)',
        }}>
          <input type="checkbox" checked={checked.includes(item.id)} onChange={() => toggle(item.id)} />
          {item.label}
        </label>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <input
          style={{ ...input, flex: 1, minWidth: 150 }}
          placeholder="Signed by (your name)"
          value={signedBy}
          onChange={(e) => setSignedBy(e.target.value)}
        />
        <button
          style={btn(true)}
          disabled={!signedBy.trim() || busy}
          onClick={() => onSubmit({ checked, signedBy })}
        >
          Sign off
        </button>
      </div>
      <p style={{ margin: '9px 0 0', fontSize: 12, color: 'var(--mute)', lineHeight: 1.5 }}>
        Tick only what you have actually checked. A sign-off is a record someone else will read
        in an inspection — an unticked item is useful information, not a failure to hide.
      </p>
    </div>
  );
}

function Overview({ data }) {
  if (!data) return <p style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</p>;

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--mute)' }}>Overall:</span>
        <Pill state={data.headline} />
        {data.headline === 'unknown' && (
          <span style={{ fontSize: 12.5, color: 'var(--mute)' }}>
            — something has no expiry date recorded, so this cannot be called compliant either way.
          </span>
        )}
      </div>

      <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>FSSAI licence</h3>
      {data.licence.onFile ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontSize: 13 }}>{data.licence.number}</span>
          <span style={{ fontSize: 12.5, color: 'var(--mute)' }}>expires {data.licence.validUntil}</span>
          <span style={{ marginLeft: 'auto' }}><Pill state={data.licence.state} /></span>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--bad)' }}>No licence on file.</p>
      )}

      <h3 style={{ margin: '20px 0 8px', fontSize: 14, fontWeight: 600 }}>
        Staff certificates ({data.certs.length})
      </h3>
      {data.certs.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--mute)' }}>None recorded.</p>
      ) : data.certs.map((c) => (
        <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontSize: 13 }}>{c.holderName}</span>
          <span style={{ fontSize: 12.5, color: 'var(--mute)' }}>{c.certType.replace(/_/g, ' ')}</span>
          <span style={{ fontSize: 12.5, color: 'var(--mute-2)' }}>{c.validUntil || 'no date'}</span>
          <span style={{ marginLeft: 'auto' }}><Pill state={c.state} /></span>
        </div>
      ))}

      <h3 style={{ margin: '20px 0 8px', fontSize: 14, fontWeight: 600 }}>Drift findings</h3>
      {data.drift.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--ok)' }}>
          Nothing drifting — sign-offs, tests and service pace all match the procedures.
        </p>
      ) : data.drift.map((f, i) => (
        <div key={i} style={{ display: 'flex', gap: 9, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
          <AlertTriangle size={14} strokeWidth={2} style={{ color: SEVERITY_TONE[f.severity], flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{f.signal}</div>
            <div style={{ fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.5 }}>{f.detail}</div>
          </div>
        </div>
      ))}
      <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--mute)', lineHeight: 1.5 }}>
        Drift is computed from your own records — sign-offs, hygiene misses, test dates, table
        alerts. Nothing here is an opinion.
      </p>
    </>
  );
}

export default function Compliance() {
  const [tab, setTab] = useState('overview');
  const { data: overview } = useComplianceOverview();
  const { data: hygiene } = useHygiene();
  const { data: shifts } = useShiftChecklists();
  const { data: pack } = useEvidencePack();

  const submitHygiene = useSubmitHygiene();
  const submitShift = useSubmitShift();
  const saveLicence = useSaveLicence();
  const saveCert = useSaveCert();
  const recordTest = useRecordTest();

  const [lic, setLic] = useState({ number: '', validUntil: '' });
  const [cert, setCert] = useState({ holderName: '', certType: 'food_handler', validUntil: '' });

  return (
    <div style={{ padding: '24px 22px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ShieldCheck size={19} strokeWidth={2} />
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: 'var(--ink)' }}>Compliance</h1>
      </div>

      <div style={{ display: 'flex', gap: 4, margin: '16px 0 14px', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5,
            border: '1px solid ' + (tab === t.key ? 'var(--ink)' : 'var(--line)'),
            background: tab === t.key ? 'var(--ink)' : 'transparent',
            color: tab === t.key ? 'var(--paper)' : 'var(--mute)',
            fontWeight: tab === t.key ? 600 : 500,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && <Overview data={overview} />}

      {tab === 'hygiene' && hygiene && (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.55 }}>
            The FSSAI Schedule 4 daily checks. The list is fixed — a checklist you can shorten to
            make it pass is not a checklist.
          </p>
          <ChecklistForm
            items={hygiene.items}
            existing={hygiene.today}
            busy={submitHygiene.isPending}
            label="Today"
            onSubmit={(body) => submitHygiene.mutate(body)}
          />
          {hygiene.repeatFailures.length > 0 && (
            <>
              <h3 style={{ margin: '20px 0 8px', fontSize: 14, fontWeight: 600 }}>Repeat misses</h3>
              {hygiene.repeatFailures.map((f) => (
                <div key={f.id} style={{ display: 'flex', gap: 10, padding: '5px 0', fontSize: 12.5 }}>
                  <span style={{ flex: 1 }}>{f.label}</span>
                  <span style={{ color: 'var(--bad)' }}>
                    missed {f.fails} of last {hygiene.history.length}
                  </span>
                </div>
              ))}
            </>
          )}
          <CameraMonitoringNote />
        </>
      )}

      {tab === 'shifts' && shifts && (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--mute)' }}>
            Sign-offs on {shifts.coverage.daysCovered} of the last {shifts.coverage.windowDays} days
            ({shifts.coverage.totalSignoffs} in total).
          </p>
          {['opening', 'closing'].map((shift) => (
            <div key={shift} style={{ marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, textTransform: 'capitalize' }}>
                {shift}
              </h3>
              <ChecklistForm
                items={shifts.items[shift]}
                existing={shifts.today[shift]}
                busy={submitShift.isPending}
                label={shift[0].toUpperCase() + shift.slice(1)}
                onSubmit={(body) => submitShift.mutate({ ...body, shift })}
              />
            </div>
          ))}
        </>
      )}

      {tab === 'testing' && overview && (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--mute)' }}>
            Each recorded test schedules the next one from its own cadence.
          </p>
          {overview.testing.map((t) => (
            <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <CalendarClock size={14} strokeWidth={2} style={{ color: 'var(--mute)' }} />
              <span style={{ fontSize: 13 }}>{t.label}</span>
              <span style={{ fontSize: 12, color: 'var(--mute-2)' }}>every {t.cadenceDays}d</span>
              <span style={{ fontSize: 12.5, color: 'var(--mute)' }}>
                {t.nextDue ? `next due ${String(t.nextDue).slice(0, 10)}` : 'no record'}
              </span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                <Pill state={t.state} />
                <button
                  style={btn()}
                  disabled={recordTest.isPending}
                  onClick={() => recordTest.mutate({ testType: t.id, signedBy: 'Recorded in dashboard' })}
                >
                  <Check size={12} strokeWidth={2.4} /> Mark done
                </button>
              </span>
            </div>
          ))}
        </>
      )}

      {tab === 'records' && (
        <>
          <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>FSSAI licence</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            <input style={{ ...input, flex: 1, minWidth: 150 }} placeholder="Licence number"
                   value={lic.number} onChange={(e) => setLic({ ...lic, number: e.target.value })} />
            <input style={{ ...input, width: 160 }} type="date"
                   value={lic.validUntil} onChange={(e) => setLic({ ...lic, validUntil: e.target.value })} />
            <button style={btn(true)} disabled={!lic.number || !lic.validUntil || saveLicence.isPending}
                    onClick={() => saveLicence.mutate(lic, { onSuccess: () => setLic({ number: '', validUntil: '' }) })}>
              <Plus size={13} strokeWidth={2.2} /> Save
            </button>
          </div>
          <p style={{ margin: '-10px 0 20px', fontSize: 12, color: 'var(--mute)' }}>
            Saving a renewal supersedes the previous record — both stay in the evidence trail.
          </p>

          <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>Staff certificate</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input style={{ ...input, flex: 1, minWidth: 140 }} placeholder="Holder name"
                   value={cert.holderName} onChange={(e) => setCert({ ...cert, holderName: e.target.value })} />
            <select style={{ ...input, width: 160 }} value={cert.certType}
                    onChange={(e) => setCert({ ...cert, certType: e.target.value })}>
              <option value="food_handler">Food handler</option>
              <option value="medical_fitness">Medical fitness</option>
            </select>
            <input style={{ ...input, width: 160 }} type="date"
                   value={cert.validUntil} onChange={(e) => setCert({ ...cert, validUntil: e.target.value })} />
            <button style={btn(true)} disabled={!cert.holderName || !cert.validUntil || saveCert.isPending}
                    onClick={() => saveCert.mutate(cert, { onSuccess: () => setCert({ holderName: '', certType: 'food_handler', validUntil: '' }) })}>
              <Plus size={13} strokeWidth={2.2} /> Save
            </button>
          </div>
        </>
      )}

      {tab === 'evidence' && pack && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <FileText size={15} strokeWidth={2} />
            <span style={{ fontSize: 13, color: 'var(--mute)' }}>
              {pack.documents.length} records on file
            </span>
            <span style={{ marginLeft: 'auto' }}><Pill state={pack.headline} /></span>
          </div>

          {/* The gaps are the point. A pack that lists only what exists tells the
              operator nothing about what they will be asked for and cannot produce. */}
          {pack.gaps.length > 0 && (
            <div style={{ padding: '12px 15px', background: 'var(--bad-soft)', borderRadius: 9, marginBottom: 14 }}>
              <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: 'var(--bad)' }}>
                What you cannot produce today
              </p>
              {pack.gaps.map((g) => (
                <div key={g} style={{ fontSize: 12.5, color: 'var(--ink-2)', padding: '2px 0' }}>· {g}</div>
              ))}
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--line-2)' }}>
              <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Record</th>
              <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Type</th>
              <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Signed by</th>
              <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Valid until</th>
            </tr></thead>
            <tbody>
              {pack.documents.slice(0, 50).map((d) => (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '6px 10px', fontSize: 12.5 }}>{d.title}</td>
                  <td style={{ padding: '6px 10px', fontSize: 12, color: 'var(--mute)' }}>{d.docType.replace(/_/g, ' ')}</td>
                  <td style={{ padding: '6px 10px', fontSize: 12, color: 'var(--mute)' }}>{d.signedBy || '—'}</td>
                  <td style={{ padding: '6px 10px', fontSize: 12, color: 'var(--mute)' }}>{d.validUntil || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
