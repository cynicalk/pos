import { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2, Mail } from 'lucide-react';
import api from '../api/client';

function Card({ children }) {
  return (
    <div
      style={{
        background: 'var(--paper)',
        border: '1px solid var(--line-2)',
        borderRadius: 10,
        padding: '28px 28px 24px',
      }}
    >
      {children}
    </div>
  );
}

function BrandHeader() {
  return (
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
    </div>
  );
}

export default function VerifyEmail() {
  const [searchParams]   = useSearchParams();
  const navigate         = useNavigate();
  const token            = searchParams.get('token');
  const [status, setStatus]       = useState(token ? 'loading' : 'no-token');
  const [resendEmail, setResendEmail] = useState('');
  const [resendSent,  setResendSent]  = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendError, setResendError] = useState('');

  useEffect(() => {
    if (!token) return;
    api.get(`/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(({ data }) => {
        if (data.needsPasswordSetup) {
          navigate(`/set-password?token=${encodeURIComponent(token)}`, { replace: true });
          return;
        }
        setStatus('success');
      })
      .catch((err) => {
        const msg = err.response?.data?.error || '';
        setStatus(msg.toLowerCase().includes('expired') ? 'expired' : 'invalid');
      });
  }, [token]);

  async function handleResend(e) {
    e.preventDefault();
    setResendError('');
    setResendLoading(true);
    try {
      await api.post('/auth/resend-verification', { email: resendEmail });
      setResendSent(true);
    } catch (err) {
      setResendError(err.response?.data?.error || 'Failed to send. Please try again.');
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
        <BrandHeader />

        {status === 'loading' && (
          <Card>
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 size={28} className="animate-spin" style={{ color: 'var(--mute)' }} />
              <p style={{ fontSize: 13, color: 'var(--mute)', margin: 0 }}>Verifying your email…</p>
            </div>
          </Card>
        )}

        {status === 'success' && (
          <Card>
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <CheckCircle2 size={36} style={{ color: 'var(--ok)' }} />
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>Email verified!</h2>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--mute)' }}>
                Your account is now active. You can sign in.
              </p>
              <Link to="/login" className="btn-primary mt-2" style={{ textDecoration: 'none', paddingLeft: 24, paddingRight: 24 }}>
                Go to sign in
              </Link>
            </div>
          </Card>
        )}

        {(status === 'expired' || status === 'invalid') && (
          <Card>
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <XCircle size={36} style={{ color: 'var(--bad)' }} />
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>
                {status === 'expired' ? 'Link expired' : 'Invalid link'}
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--mute)' }}>
                {status === 'expired'
                  ? 'This verification link has expired. Request a new one below.'
                  : 'This verification link is invalid or has already been used.'}
              </p>
            </div>

            {!resendSent ? (
              <form onSubmit={handleResend} className="mt-5 space-y-3">
                <input
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  className="input"
                  placeholder="your@email.com"
                  required
                />
                {resendError && (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--bad)' }}>{resendError}</p>
                )}
                <button
                  type="submit"
                  disabled={resendLoading}
                  className="btn-primary"
                  style={{ width: '100%', height: 38, justifyContent: 'center' }}
                >
                  {resendLoading
                    ? <><Loader2 size={13} className="animate-spin" /> Sending…</>
                    : 'Resend verification email'}
                </button>
              </form>
            ) : (
              <p
                className="mt-4 rounded-md px-3 py-2 text-center"
                style={{ fontSize: 13, color: 'var(--ok)', background: 'rgba(34,197,94,.07)' }}
              >
                Check your inbox — a new link is on its way.
              </p>
            )}
          </Card>
        )}

        {status === 'no-token' && (
          <Card>
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <Mail size={32} style={{ color: 'var(--mute)' }} />
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>Verify your email</h2>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--mute)' }}>
                Enter your address below and we'll send a new verification link.
              </p>
            </div>

            {!resendSent ? (
              <form onSubmit={handleResend} className="mt-5 space-y-3">
                <input
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  className="input"
                  placeholder="your@email.com"
                  required
                />
                {resendError && (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--bad)' }}>{resendError}</p>
                )}
                <button
                  type="submit"
                  disabled={resendLoading}
                  className="btn-primary"
                  style={{ width: '100%', height: 38, justifyContent: 'center' }}
                >
                  {resendLoading
                    ? <><Loader2 size={13} className="animate-spin" /> Sending…</>
                    : 'Send verification email'}
                </button>
              </form>
            ) : (
              <p
                className="mt-4 rounded-md px-3 py-2 text-center"
                style={{ fontSize: 13, color: 'var(--ok)', background: 'rgba(34,197,94,.07)' }}
              >
                Check your inbox — a new link is on its way.
              </p>
            )}
          </Card>
        )}

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 11.5, color: 'var(--mute-2)' }}>
          <Link to="/login" style={{ color: 'var(--mute)', textDecoration: 'none' }}>← Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
