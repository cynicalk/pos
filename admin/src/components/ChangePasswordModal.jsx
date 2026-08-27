import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Lock } from 'lucide-react';
import api from '../api/client';

export default function ChangePasswordModal({ onClose, forced = false, onForcedSuccess }) {
  const [current, setCurrent] = useState('');
  const [next,    setNext]    = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (next !== confirm) { setError('New passwords do not match.'); return; }
    if (next.length < 8)  { setError('New password must be at least 8 characters.'); return; }

    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: current,
        newPassword:     next,
      });
      if (forced) {
        const stored = JSON.parse(localStorage.getItem('admin_user') || '{}');
        stored.forcePasswordChange = false;
        localStorage.setItem('admin_user', JSON.stringify(stored));
      }
      setSuccess(true);
      setTimeout(() => {
        if (forced && onForcedSuccess) onForcedSuccess();
        else onClose();
      }, 1500);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to change password.');
    } finally {
      setLoading(false);
    }
  }

  const pwdType = showPwd ? 'text' : 'password';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(10,10,10,.4)' }}
      onClick={(e) => { if (!forced && e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm"
        style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 8 }}
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <div className="flex items-center gap-2">
            <Lock size={14} style={{ color: 'var(--mute)' }} />
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
              {forced ? 'Set your password' : 'Change Password'}
            </h2>
          </div>
          {!forced && (
            <button
              onClick={onClose}
              className="rounded-md p-1 transition-colors"
              style={{ color: 'var(--mute)', background: 'transparent', border: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {success ? (
          <div className="px-6 py-10 text-center">
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ok)' }}>Password changed successfully!</p>
            <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 4 }}>Closing…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
            {error && (
              <p className="rounded-[6px] px-3 py-2" style={{ fontSize: 12, color: 'var(--bad)', background: 'rgba(179,55,43,.06)' }}>
                {error}
              </p>
            )}

            {!forced && (
              <div>
                <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>Current Password</label>
                <input type={pwdType} value={current} onChange={(e) => setCurrent(e.target.value)} className="input w-full" autoFocus required />
              </div>
            )}

            <div>
              <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>New Password</label>
              <input type={pwdType} value={next} onChange={(e) => setNext(e.target.value)} className="input w-full" autoFocus={forced} required />
              <p style={{ fontSize: 11, color: 'var(--mute)', marginTop: 4 }}>Minimum 8 characters</p>
            </div>

            <div>
              <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>Confirm New Password</label>
              <input type={pwdType} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input w-full" required />
            </div>

            <label className="flex cursor-pointer items-center gap-2" style={{ fontSize: 12, color: 'var(--mute)' }}>
              <input type="checkbox" checked={showPwd} onChange={(e) => setShowPwd(e.target.checked)} className="rounded" />
              Show passwords
            </label>

            {forced && (
              <p style={{ fontSize: 12, color: 'var(--mute)', background: 'var(--hover)', borderRadius: 6, padding: '8px 12px', margin: 0 }}>
                Your password was set by an administrator. Please set your own password to continue.
              </p>
            )}
            <div className="flex gap-2 pt-1">
              {!forced && (
                <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              )}
              <button type="submit" disabled={loading} className="btn-primary disabled:opacity-50" style={{ flex: 1 }}>
                {loading ? 'Saving…' : forced ? 'Set Password' : 'Change Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
