import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();

  useEffect(() => {
    const d     = searchParams.get('d');
    const error = searchParams.get('error');

    if (error) {
      const messages = {
        no_account:       'No CookLyt account is linked to this Google account. Contact your admin.',
        disabled:         'This account has been disabled.',
        oauth_cancelled:  'Google sign-in was cancelled.',
        oauth_failed:     'Google sign-in failed. Please try again.',
      };
      navigate(`/login?oauthError=${encodeURIComponent(messages[error] || 'Sign-in failed.')}`, { replace: true });
      return;
    }

    if (d) {
      try {
        const data = JSON.parse(atob(d.replace(/-/g, '+').replace(/_/g, '/')));
        localStorage.setItem('pos_user',       JSON.stringify(data.user));
        localStorage.setItem('pos_restaurant', JSON.stringify(data.restaurant));
        navigate('/overview', { replace: true });
      } catch {
        navigate('/login?oauthError=Sign-in+failed.', { replace: true });
      }
      return;
    }

    navigate('/login', { replace: true });
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
