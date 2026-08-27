import { useState, useEffect } from 'react';
import { User, Lock, Globe, KeyRound, Check, AlertCircle, Building2 } from 'lucide-react';
import { useMe, useChangePassword, useUpdateDefaults } from '../hooks/useAdmin';
import SETTINGS_OPTIONS from '../../../shared/settings-options.json';

const TIMEZONES  = SETTINGS_OPTIONS.timezones;
const CURRENCIES = SETTINGS_OPTIONS.currencies;

function Section({ Icon, title, children }) {
  return (
    <section style={{ border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--paper)' }}>
      <div className="flex items-center gap-2 px-6 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
        <Icon size={14} style={{ color: 'var(--mute)' }} />
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{title}</h2>
      </div>
      <div className="px-6 py-5">
        {children}
      </div>
    </section>
  );
}

export default function Settings() {
  const { data: me, isLoading } = useMe();
  const changePassword = useChangePassword();
  const updateDefaults = useUpdateDefaults();

  const [current,  setCurrent]  = useState('');
  const [next,     setNext]     = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSaved, setPwdSaved] = useState(false);

  async function handleChangePwd(e) {
    e.preventDefault();
    setPwdError('');
    setPwdSaved(false);
    if (next !== confirm) { setPwdError('New passwords do not match.'); return; }
    if (next.length < 8)  { setPwdError('New password must be at least 8 characters.'); return; }
    try {
      await changePassword.mutateAsync({ currentPassword: current, newPassword: next });
      setPwdSaved(true);
      setCurrent(''); setNext(''); setConfirm('');
      setTimeout(() => setPwdSaved(false), 3000);
    } catch (err) {
      setPwdError(err.response?.data?.error || 'Failed to change password.');
    }
  }

  const serverDefaults = me?.defaults || {};
  const [defTz,    setDefTz]    = useState('UTC');
  const [defCur,   setDefCur]   = useState('USD');
  const [defTax,   setDefTax]   = useState('0');
  const [defSC,    setDefSC]    = useState('0');
  const [defSaved, setDefSaved] = useState(false);
  const [defError, setDefError] = useState('');

  useEffect(() => {
    if (!me) return;
    setDefTz(serverDefaults.timezone       || 'UTC');
    setDefCur(serverDefaults.currency      || 'USD');
    setDefTax(serverDefaults.tax_rate      || '0');
    setDefSC(serverDefaults.service_charge || '0');
  }, [me]);

  async function saveDefaults() {
    setDefError('');
    try {
      await updateDefaults.mutateAsync({ timezone: defTz, currency: defCur, tax_rate: defTax, service_charge: defSC });
      setDefSaved(true);
      setTimeout(() => setDefSaved(false), 2500);
    } catch (err) {
      setDefError(err.response?.data?.error || 'Failed to save defaults.');
    }
  }

  const pwdType = showPwd ? 'text' : 'password';

  return (
    <div className="max-w-2xl space-y-5">

      {/* Profile */}
      <Section Icon={User} title="My Account">
        {isLoading ? (
          <p style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</p>
        ) : (
          <div className="space-y-3">
            <div>
              <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)' }}>Email</p>
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginTop: 2 }}>{me?.email}</p>
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)' }}>Member since</p>
              <p style={{ fontSize: 13, color: 'var(--ink)', marginTop: 2 }}>
                {me?.createdAt
                  ? new Date(me.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                  : '—'}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)' }}>Role</p>
              <span
                className="inline-flex items-center gap-1.5 mt-1"
                style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: me?.role === 'product_manager' ? 'var(--warn)' : 'var(--info)', flexShrink: 0 }} />
                {me?.role === 'product_manager' ? 'Product Manager' : 'Super Admin'}
              </span>
            </div>
          </div>
        )}
      </Section>

      {/* Change password */}
      <Section Icon={Lock} title="Security">
        <form onSubmit={handleChangePwd} className="space-y-4">
          {pwdError && (
            <div className="flex items-center gap-2 rounded-[6px] px-3 py-2" style={{ fontSize: 12, color: 'var(--bad)', background: 'rgba(179,55,43,.06)' }}>
              <AlertCircle size={13} style={{ flexShrink: 0 }} /> {pwdError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>Current Password</label>
              <input type={pwdType} value={current} onChange={(e) => setCurrent(e.target.value)} className="input w-full" required />
            </div>
            <div>
              <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>New Password</label>
              <input type={pwdType} value={next} onChange={(e) => setNext(e.target.value)} className="input w-full" required />
            </div>
            <div>
              <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>Confirm New Password</label>
              <input type={pwdType} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input w-full" required />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2" style={{ fontSize: 12, color: 'var(--mute)' }}>
              <input type="checkbox" checked={showPwd} onChange={(e) => setShowPwd(e.target.checked)} className="rounded" />
              Show passwords
            </label>
            <p style={{ fontSize: 11, color: 'var(--mute)' }}>Minimum 8 characters</p>
          </div>

          <div className="flex items-center gap-3">
            <button type="submit" disabled={changePassword.isPending} className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
              <KeyRound size={13} />
              {changePassword.isPending ? 'Saving…' : 'Change Password'}
            </button>
            {pwdSaved && (
              <span className="flex items-center gap-1" style={{ fontSize: 12, color: 'var(--ok)' }}>
                <Check size={13} /> Password updated
              </span>
            )}
          </div>
        </form>
      </Section>

      {/* New-restaurant defaults */}
      <Section Icon={Building2} title="New Restaurant Defaults">
        <div className="space-y-5">
          <p style={{ fontSize: 12, color: 'var(--mute)' }}>
            These values are pre-filled when you create a new restaurant. They can be overridden
            per restaurant from the restaurant detail page.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>Default Timezone</label>
              <select value={defTz} onChange={(e) => setDefTz(e.target.value)} className="input w-full">
                {TIMEZONES.map((t) => (
                  <option key={t.iana} value={t.iana}>{t.label} ({t.offset})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>Default Currency</label>
              <select value={defCur} onChange={(e) => setDefCur(e.target.value)} className="input w-full">
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>Default Tax Rate (%)</label>
              <input type="number" min="0" max="100" step="0.01" value={defTax}
                onChange={(e) => setDefTax(e.target.value)} className="input w-full" placeholder="0" />
            </div>

            <div>
              <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>Default Service Charge (%)</label>
              <input type="number" min="0" max="100" step="0.01" value={defSC}
                onChange={(e) => setDefSC(e.target.value)} className="input w-full" placeholder="0" />
            </div>
          </div>

          {defError && (
            <div className="flex items-center gap-2 rounded-[6px] px-3 py-2" style={{ fontSize: 12, color: 'var(--bad)', background: 'rgba(179,55,43,.06)' }}>
              <AlertCircle size={13} style={{ flexShrink: 0 }} /> {defError}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button onClick={saveDefaults} disabled={updateDefaults.isPending} className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
              <Globe size={13} /> {updateDefaults.isPending ? 'Saving…' : 'Save Defaults'}
            </button>
            {defSaved && (
              <span className="flex items-center gap-1" style={{ fontSize: 12, color: 'var(--ok)' }}>
                <Check size={13} /> Saved
              </span>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}
