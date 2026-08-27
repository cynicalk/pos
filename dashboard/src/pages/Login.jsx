import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Mail } from 'lucide-react';
import api from '../api/client';

const GOOGLE_ENABLED = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;
const API_URL        = import.meta.env.VITE_API_URL || '';

const OAUTH_ERRORS = {
  no_account:      'No CookLyt account is linked to this Google address. Ask your admin to add you as a user first.',
  disabled:        'Your account has been disabled. Contact your admin.',
  oauth_cancelled: 'Google sign-in was cancelled.',
  oauth_failed:    'Google sign-in failed. Please try again.',
};

export default function Login() {
  const navigate = useNavigate();
  const [searchParams]  = useSearchParams();
  const rawError   = searchParams.get('error');
  const oauthError = searchParams.get('oauthError') || OAUTH_ERRORS[rawError] || null;
  const [form, setForm]           = useState({ email: '', password: '' });
  const [showPass, setShowPass]   = useState(false);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setUnverified(false);
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', form);
      localStorage.setItem('pos_user',       JSON.stringify(data.user));
      localStorage.setItem('pos_restaurant', JSON.stringify(data.restaurant));
      if (data.user.forcePasswordChange) {
        navigate('/change-password');
        return;
      }
      navigate('/overview');
    } catch (err) {
      if (err.response?.data?.error === 'EMAIL_NOT_VERIFIED') {
        setUnverified(true);
      } else {
        setError(err.response?.data?.error || 'Login failed. Check your connection.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResendLoading(true);
    try {
      await api.post('/auth/resend-verification', { email: form.email });
      setResendSent(true);
    } catch {
      // silent — always shows success message for security
      setResendSent(true);
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 py-8"
      style={{ background: 'var(--paper-2)' }}
    >
      <div className="w-full max-w-sm">

        {/* Brand mark — above the card */}
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
            Sign in to your restaurant dashboard
          </p>
        </div>

        {/* Card */}
        <div
          style={{
            background: 'var(--paper)',
            border: '1px solid var(--line-2)',
            borderRadius: 10,
            padding: '28px 28px 24px',
          }}
        >
          {unverified ? (
            <div className="space-y-4">
              <div
                className="flex items-start gap-3 rounded-md px-3 py-3"
                style={{ background: 'rgba(176,106,59,.08)', border: '1px solid rgba(176,106,59,.2)' }}
              >
                <Mail size={16} style={{ color: '#b06a3b', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Email not verified</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--mute)' }}>
                    Check your inbox for a verification link, or request a new one.
                  </p>
                </div>
              </div>

              {resendSent ? (
                <p style={{ fontSize: 12, color: 'var(--ok)', margin: 0 }}>
                  ✓ A new verification email is on its way to <strong>{form.email}</strong>.
                </p>
              ) : (
                <button
                  onClick={handleResend}
                  disabled={resendLoading}
                  className="btn-primary"
                  style={{ width: '100%', height: 38, justifyContent: 'center' }}
                >
                  {resendLoading
                    ? <><Loader2 size={13} className="animate-spin" /> Sending…</>
                    : 'Resend verification email'}
                </button>
              )}

              <button
                onClick={() => { setUnverified(false); setResendSent(false); }}
                className="btn-secondary"
                style={{ width: '100%', height: 38, justifyContent: 'center' }}
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">

              <div>
                <label
                  htmlFor="email"
                  style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--mute)', marginBottom: 5 }}
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="input"
                  placeholder="you@restaurant.com"
                  autoComplete="username"
                  autoFocus
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between" style={{ marginBottom: 5 }}>
                  <label
                    htmlFor="password"
                    style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--mute)' }}
                  >
                    Password
                  </label>
                  <Link
                    to="/forgot-password"
                    style={{ fontSize: 11.5, color: 'var(--mute)', textDecoration: 'none' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--mute)')}
                  >
                    Forgot password?
                  </Link>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    id="password"
                    type={showPass ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    className="input"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    style={{ paddingRight: 36 }}
                    required
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

              {error && (
                <p
                  style={{
                    margin: 0, fontSize: 12, color: 'var(--bad)',
                    background: 'rgba(179,55,43,.06)', borderRadius: 6, padding: '8px 12px',
                  }}
                >
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
                  ? <><Loader2 size={13} className="animate-spin" /> Signing in…</>
                  : 'Sign in'}
              </button>

              {GOOGLE_ENABLED && (
                <>
                  <div className="flex items-center gap-3" style={{ margin: '4px 0' }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                    <span style={{ fontSize: 11, color: 'var(--mute-2)' }}>or</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                  </div>
                  <a
                    href={`${API_URL}/api/auth/google`}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                      width: '100%', height: 38, borderRadius: 6, fontSize: 13, fontWeight: 500,
                      border: '1px solid var(--line-2)', color: 'var(--ink)', textDecoration: 'none',
                      background: 'var(--paper)', transition: 'background .08s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--paper)')}
                  >
                    <svg width="16" height="16" viewBox="0 0 48 48">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    </svg>
                    Sign in with Google
                  </a>
                </>
              )}

            </form>
          )}

          {oauthError && (
            <div
              style={{
                margin: '16px 0 0',
                padding: '10px 14px',
                borderRadius: 7,
                background: 'rgba(179,55,43,.06)',
                border: '1px solid rgba(179,55,43,.15)',
              }}
            >
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--bad)', lineHeight: 1.5 }}>
                {oauthError}
              </p>
            </div>
          )}
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 11.5, color: 'var(--mute-2)' }}>
          Can't log in? Contact your administrator.
        </p>

      </div>
    </div>
  );
}
