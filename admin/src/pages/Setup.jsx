import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function Setup() {
  const navigate = useNavigate();
  const [form, setForm]       = useState({ email: '', password: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/setup', form);
      localStorage.setItem('admin_user', JSON.stringify(data.admin));
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Setup failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-8"
      style={{ background: 'var(--paper-2)' }}
    >
      <div
        className="w-full max-w-sm p-8"
        style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 8 }}
      >
        <div className="mb-6">
          <span
            className="inline-block rounded-full px-3 py-1 mb-3"
            style={{ fontSize: 11, fontWeight: 600, background: 'var(--paper-2)', color: 'var(--mute)', border: '1px solid var(--line-2)' }}
          >
            First-run setup
          </span>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Create operator account</h1>
          <p style={{ fontSize: 13, color: 'var(--mute)' }}>
            This page is only available once. Store these credentials safely.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="input"
              placeholder="ops@cooklyt.com"
              required
            />
          </div>
          <div>
            <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="input"
              placeholder="••••••••"
              minLength={8}
              required
            />
          </div>
          {error && (
            <p className="rounded-[6px] px-3 py-2" style={{ fontSize: 12, color: 'var(--bad)', background: 'rgba(179,55,43,.06)' }}>
              {error}
            </p>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
            {loading ? 'Creating…' : 'Create operator account'}
          </button>
        </form>
      </div>
    </div>
  );
}
