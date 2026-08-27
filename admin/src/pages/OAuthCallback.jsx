import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const ERROR_MESSAGES = {
  no_account:      'No operator account is linked to this Google address.',
  oauth_cancelled: 'Google sign-in was cancelled.',
  oauth_failed:    'Google sign-in failed. Please try again.',
};

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();

  useEffect(() => {
    const error = searchParams.get('error');

    if (error) {
      const msg = ERROR_MESSAGES[error] || 'Sign-in failed.';
      navigate(`/login?oauthError=${encodeURIComponent(msg)}`, { replace: true });
      return;
    }

    // Cookie is already set by the server; RequireAuth will verify it via /auth/me
    navigate('/', { replace: true });
  }, []);

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ background: 'var(--paper-2)' }}
    >
      <Loader2 size={22} className="animate-spin" style={{ color: 'var(--mute)' }} />
    </div>
  );
}
