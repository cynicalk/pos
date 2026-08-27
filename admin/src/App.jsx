import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Layout           from './components/Layout';
import Login            from './pages/Login';
import Setup            from './pages/Setup';
import OAuthCallback    from './pages/OAuthCallback';
import VerifyEmail      from './pages/VerifyEmail';
import Restaurants      from './pages/Restaurants';
import RestaurantDetail from './pages/RestaurantDetail';
import UsersPage        from './pages/Users';
import AuditLogs        from './pages/AuditLogs';
import Settings         from './pages/Settings';
import { useMe }        from './hooks/useAdmin';

function RequireAuth({ children }) {
  const { data, isLoading, isError } = useMe();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--paper-2)' }}>
        <Loader2 size={22} className="animate-spin" style={{ color: 'var(--mute)' }} />
      </div>
    );
  }

  if (isError || !data) return <Navigate to="/login" replace />;

  // Keep localStorage in sync so Layout's useAuth hook reads current values
  localStorage.setItem('admin_user', JSON.stringify({
    id: data.id,
    email: data.email,
    role: data.role,
    emailVerified: data.emailVerified,
    forcePasswordChange: data.forcePasswordChange,
  }));

  return children;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login"          element={<Login />} />
        <Route path="/setup"          element={<Setup />} />
        <Route path="/verify-email"   element={<VerifyEmail />} />
        <Route path="/oauth/callback" element={<OAuthCallback />} />

        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Restaurants />} />
          <Route path="restaurants/:id" element={<RestaurantDetail />} />
          <Route path="users"      element={<UsersPage />} />
          <Route path="audit-logs" element={<AuditLogs />} />
          <Route path="settings"   element={<Settings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
