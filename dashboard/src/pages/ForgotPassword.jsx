import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Mail } from 'lucide-react';
import api from '../api/client';

export default function ForgotPassword() {
  const [email,   setEmail]   = useState('');
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
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
            Reset your password
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
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <Mail size={32} style={{ color: 'var(--ok)' }} />
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>Check your inbox</h2>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--mute)' }}>
                If an account exists for <strong>{email}</strong>, a reset link has been sent.
                It expires in <strong>1 hour</strong>.
              </p>
              <Link to="/login" className="btn-secondary mt-2" style={{ textDecoration: 'none' }}>
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p style={{ margin: 0, fontSize: 13, color: 'var(--mute)' }}>
                Enter your email address and we'll send you a link to reset your password.
              </p>

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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="you@restaurant.com"
                  autoFocus
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
                  ? <><Loader2 size={13} className="animate-spin" /> Sending…</>
                  : 'Send reset link'}
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
