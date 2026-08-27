import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import api from '../api/client';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token          = searchParams.get('token');

  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 py-8"
      style={{ background: 'var(--paper-2)' }}
    >
      <div className="w-full max-w-sm">

        <div className="mb-7 flex flex-col items-center text-center">
          <Link to="/" className="flex flex-col items-center" style={{ textDecoration: 'none' }}>
            <svg width="52" height="52" viewBox="0 0 200 200" fill="none" role="img" aria-label="CookLyt" style={{ marginBottom: 14 }}>
              <path d="M 154.194 25.409 A 92.2 92.2 0 1 0 154.194 174.591"
                    fill="none" stroke="#0d0c0b" strokeWidth="15.6" strokeLinecap="round"/>
              <circle cx="100" cy="100" r="10.8" fill="#b06a3b"/>
            </svg>
            <svg width="158" height="28" viewBox="0 0 360 64" role="img" aria-label="CookLyt" style={{ marginBottom: 10 }}>
              <text x="0" y="49" fill="#0d0c0b" style={{ fontFamily: "'Marcellus', serif", fontSize: 56, letterSpacing: '10.08px' }}>COOKLY</text>
              <circle cx="294.2" cy="29.43" r="5.03" fill="#b06a3b"/>
              <text x="309.33" y="49" fill="#0d0c0b" style={{ fontFamily: "'Marcellus', serif", fontSize: 56, letterSpacing: '10.08px' }}>T</text>
            </svg>
          </Link>
          <p style={{ fontSize: 12.5, color: 'var(--mute)', margin: 0 }}>
            Set a new password
          </p>
        </div>

        <div
          style={{
            background: 'var(--paper)',
            border: '1px solid var(--line-2)',
            borderRadius: 10,
            padding: '28px 28px 24px',
          }}
        >
          {!token ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <p style={{ margin: 0, fontSize: 13, color: 'var(--bad)' }}>
                No reset token found. Please use the link from your email.
              </p>
              <Link to="/forgot-password" className="btn-secondary mt-2" style={{ textDecoration: 'none' }}>
                Request a new link
              </Link>
            </div>
          ) : success ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <CheckCircle2 size={36} style={{ color: 'var(--ok)' }} />
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>Password updated!</h2>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--mute)' }}>
                Your password has been changed. You can now sign in.
              </p>
              <Link to="/login" className="btn-primary mt-2" style={{ textDecoration: 'none', paddingLeft: 24, paddingRight: 24 }}>
                Sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="password"
                  style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--mute)', marginBottom: 5 }}
                >
                  New password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="password"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input"
                    placeholder="Minimum 8 characters"
                    autoFocus
                    minLength={8}
                    required
                    style={{ paddingRight: 36 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                    style={{
                      position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', padding: 2, cursor: 'pointer',
                      color: 'var(--mute-2)', display: 'flex', borderRadius: 4,
                    }}
                  >
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="confirm"
                  style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--mute)', marginBottom: 5 }}
                >
                  Confirm password
                </label>
                <input
                  id="confirm"
                  type={showPass ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="input"
                  placeholder="Repeat your password"
                  minLength={8}
                  required
                />
              </div>

              {error && (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--bad)', background: 'rgba(179,55,43,.06)', borderRadius: 6, padding: '8px 12px' }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
                style={{ width: '100%', height: 38, justifyContent: 'center', marginTop: 2 }}
              >
                {loading
                  ? <><Loader2 size={13} className="animate-spin" /> Saving…</>
                  : 'Set new password'}
              </button>
            </form>
          )}
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 11.5, color: 'var(--mute-2)' }}>
          <Link to="/login" style={{ color: 'var(--mute)', textDecoration: 'none' }}>← Back to sign in</Link>
        </p>

      </div>
    </div>
  );
}
