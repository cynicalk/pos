import { useState, useEffect, useRef } from 'react';
import { UserPlus, Trash2, ShieldCheck, User, ChefHat, Banknote, Check, X, QrCode, KeyRound, MapPin, BadgeCheck, MailWarning, Send } from 'lucide-react';
import { useUsers, useCreateUser, useDeleteUser, useUpdateUserRole, useUpdateUserName, useSetStaffPin, useSetUserActive, useSetUserPresent, useResendVerification } from '../hooks/useUsers';
import { useAuth } from '../hooks/useAuth';
import Modal from '../components/Modal';
import SelectField from '../components/SelectField';
import QRCode from 'qrcode';

const ROLES = ['admin', 'staff', 'cashier', 'kitchen'];

function VerifiedIcon({ verified }) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', cursor: 'default' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => setShow((v) => !v)}
    >
      {verified
        ? <BadgeCheck size={13} style={{ color: 'var(--ok)' }} />
        : <MailWarning size={13} style={{ color: 'var(--warn)' }} />}
      {show && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 5px)', left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--ink)', color: '#fff',
          fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
          padding: '3px 8px', borderRadius: 4, pointerEvents: 'none',
          zIndex: 10,
        }}>
          {verified ? 'Email verified' : 'Email not verified'}
        </span>
      )}
    </span>
  );
}

const ROLE_DOT = {
  admin:   'var(--info)',
  staff:   'var(--mute)',
  cashier: 'var(--ok)',
  kitchen: 'var(--warn)',
};

const ROLE_ICON = {
  admin:   ShieldCheck,
  staff:   User,
  cashier: Banknote,
  kitchen: ChefHat,
};

const EMPTY_FORM = { email: '', role: 'staff', name: '' };

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function RoleCell({ user, isSelf, onSave }) {
  const [editing,  setEditing]  = useState(false);
  const [selected, setSelected] = useState(user.role);
  const updateRole = useUpdateUserRole();

  async function save() {
    if (selected !== user.role) await onSave(user.id, selected);
    setEditing(false);
  }

  function cancel() {
    setSelected(user.role);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <SelectField
          value={selected}
          onChange={(v) => setSelected(v)}
          style={{ fontSize: 12, fontWeight: 500, padding: '3px 8px', width: 'auto' }}
          options={ROLES.map((r) => ({ value: r, label: r.charAt(0).toUpperCase() + r.slice(1) }))}
        />
        <button
          onClick={save}
          disabled={updateRole.isPending}
          className="btn btn-sm btn-ghost disabled:opacity-50"
          style={{ color: 'var(--ok)' }}
          title="Save"
        >
          <Check size={13} />
        </button>
        <button
          onClick={cancel}
          className="rounded-md p-1 transition-colors"
          style={{ color: 'var(--mute)', background: 'transparent', border: 0, cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; }}
          title="Cancel"
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  const Icon = ROLE_ICON[user.role] ?? User;

  return (
    <button
      onClick={() => !isSelf && setEditing(true)}
      disabled={isSelf}
      title={isSelf ? 'Cannot change your own role' : 'Click to change role'}
      className="inline-flex items-center gap-1.5"
      style={{
        fontSize: 12, fontWeight: 500, textTransform: 'capitalize',
        color: 'var(--ink)', background: 'transparent', border: 0, padding: 0,
        cursor: isSelf ? 'default' : 'pointer', opacity: isSelf ? 0.6 : 1,
      }}
    >
      <span
        style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: ROLE_DOT[user.role] ?? 'var(--mute)',
        }}
      />
      {user.role}
    </button>
  );
}

function NameCell({ user, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value,   setValue]   = useState(user.name || '');
  const updateName = useUpdateUserName();

  async function save() {
    const trimmed = value.trim();
    if (trimmed !== (user.name || '')) await onSave(user.id, trimmed || null);
    setEditing(false);
  }

  function cancel() {
    setValue(user.name || '');
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
          className="input"
          style={{ padding: '3px 8px', fontSize: 12, width: 140 }}
          placeholder="Display name"
          maxLength={100}
        />
        <button onClick={save} disabled={updateName.isPending} className="btn btn-sm btn-ghost disabled:opacity-50" style={{ color: 'var(--ok)' }} title="Save">
          <Check size={13} />
        </button>
        <button onClick={cancel} className="rounded-md p-1 transition-colors" style={{ color: 'var(--mute)', background: 'transparent', border: 0, cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; }}
          title="Cancel">
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Click to edit name"
      style={{ fontSize: 12, background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: user.name ? 'var(--ink)' : 'var(--mute-2)', textAlign: 'left' }}
    >
      {user.name || <span style={{ fontStyle: 'italic' }}>— add name</span>}
    </button>
  );
}

function PinModal({ user, onClose }) {
  const setPin = useSetStaffPin();
  const [pin,      setPin_]  = useState(user.staff_pin || '');
  const [qrUrl,    setQrUrl] = useState('');
  const [saving,   setSaving] = useState(false);
  const [error,    setError]  = useState('');
  const [saved,    setSaved]  = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!user.staff_pin) return;
    QRCode.toDataURL(user.staff_pin, { width: 180, margin: 2 })
      .then(setQrUrl)
      .catch(() => {});
  }, [user.staff_pin]);

  async function handleSave() {
    setError('');
    if (pin && !/^\d{4}$/.test(pin)) { setError('PIN must be exactly 4 digits'); return; }
    setSaving(true);
    try {
      await setPin.mutateAsync({ id: user.id, pin: pin || null });
      if (pin) {
        const url = await QRCode.toDataURL(pin, { width: 180, margin: 2 });
        setQrUrl(url);
      } else {
        setQrUrl('');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to save PIN');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Staff PIN — ${user.email.split('@')[0]}`} onClose={onClose}>
      <div className="space-y-4">
        <p style={{ fontSize: 12, color: 'var(--mute)' }}>
          Set a 4-digit PIN for this staff member. Customers enter this code when placing orders (if Staff Assignment is enabled in Settings).
        </p>

        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => { setPin_(e.target.value.replace(/\D/g, '').slice(0, 4)); setSaved(false); }}
            className="input mono"
            style={{ width: 100, letterSpacing: '0.3em', fontSize: 18, textAlign: 'center' }}
            placeholder="1234"
          />
          <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          {pin && (
            <button
              onClick={() => { setPin_(''); setPin.mutateAsync({ id: user.id, pin: null }); setQrUrl(''); }}
              className="btn-secondary"
              title="Clear PIN"
            >
              <X size={13} /> Clear
            </button>
          )}
          {saved && <span style={{ fontSize: 12, color: 'var(--ok)' }}><Check size={12} /> Saved</span>}
        </div>

        {error && (
          <p style={{ fontSize: 12, color: 'var(--bad)' }}>{error}</p>
        )}

        {qrUrl && (
          <div className="flex flex-col items-center gap-3 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
            <p style={{ fontSize: 12, color: 'var(--mute)', textAlign: 'center' }}>
              Staff QR — customer scans to auto-fill the code
            </p>
            <img src={qrUrl} alt={`QR for PIN ${pin || user.staff_pin}`} style={{ width: 180, height: 180, borderRadius: 8 }} />
            <p className="mono" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.3em', color: 'var(--ink)' }}>
              {pin || user.staff_pin}
            </p>
            <a
              href={qrUrl}
              download={`staff-qr-${user.email.split('@')[0]}.png`}
              className="btn-secondary"
              style={{ fontSize: 12 }}
            >
              Download QR
            </a>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function Users() {
  const { data: users = [], isLoading } = useUsers();
  const createUser    = useCreateUser();
  const deleteUser    = useDeleteUser();
  const updateRole    = useUpdateUserRole();
  const updateName    = useUpdateUserName();
  const setUserActive      = useSetUserActive();
  const setUserPresent     = useSetUserPresent();
  const resendVerification = useResendVerification();

  const [addModal,       setAddModal]       = useState(false);
  const [resendingId,    setResendingId]    = useState(null);
  const [resentId,       setResentId]       = useState(null);
  const [confirmDelete,  setConfirmDelete]  = useState(null);
  const [pinModal,       setPinModal]       = useState(null); // user object
  const [form,           setForm]           = useState(EMPTY_FORM);
  const [formError,      setFormError]      = useState('');

  const { user: me } = useAuth();

  async function handleCreate(e) {
    e.preventDefault();
    setFormError('');
    try {
      await createUser.mutateAsync(form);
      setAddModal(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to create user');
    }
  }

  async function handleDelete(id) {
    await deleteUser.mutateAsync(id);
    setConfirmDelete(null);
  }

  async function handleResendVerification(user) {
    setResendingId(user.id);
    try {
      await resendVerification.mutateAsync(user.id);
      setResentId(user.id);
      setTimeout(() => setResentId(null), 3000);
    } catch {}
    finally { setResendingId(null); }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p style={{ fontSize: 12, color: 'var(--mute)' }}>
          {users.length} user{users.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => { setForm(EMPTY_FORM); setFormError(''); setAddModal(true); }}
          className="btn-primary flex items-center gap-1.5"
        >
          <UserPlus size={14} /> Add User
        </button>
      </div>

      {/* Table */}
      <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--paper)', overflowX: 'auto' }}>
        {isLoading ? (
          <div className="py-16 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>Loading users…</div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>No users found</div>
        ) : (
          <table className="w-full" style={{ minWidth: 520, fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th className="px-5 py-3 text-left" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)' }}>Email</th>
                <th className="px-5 py-3 text-left" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)' }}>
                  Name
                  <span style={{ marginLeft: 6, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--line-2)' }}>(click to edit)</span>
                </th>
                <th className="px-5 py-3 text-left" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)' }}>
                  Role
                  <span style={{ marginLeft: 6, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--line-2)' }}>(click to change)</span>
                </th>
                <th className="px-5 py-3 text-left" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)' }}>Staff PIN</th>
                <th className="px-5 py-3 text-left" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)' }}>Present</th>
                <th className="px-5 py-3 text-left" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)' }}>Active</th>
                <th className="px-5 py-3 text-left" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)' }}>Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === me.id;
                return (
                  <tr
                    key={user.id}
                    style={{ borderBottom: '1px solid var(--line)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{user.email}</span>
                        {isSelf && (
                          <span
                            className="rounded-full px-2 py-0.5"
                            style={{ fontSize: 10, fontWeight: 500, background: 'var(--hover)', color: 'var(--mute)' }}
                          >
                            you
                          </span>
                        )}
                        {user.email_verified ? (
                          <VerifiedIcon verified />
                        ) : (
                          <>
                            <VerifiedIcon verified={false} />
                            {!isSelf && (
                              <button
                                onClick={() => handleResendVerification(user)}
                                disabled={resendingId === user.id}
                                title="Resend invite email"
                                className="inline-flex items-center gap-1"
                                style={{
                                  fontSize: 11, border: 0, padding: '2px 6px',
                                  borderRadius: 4, cursor: 'pointer',
                                  color: resentId === user.id ? 'var(--ok)' : 'var(--mute)',
                                  background: 'var(--hover)',
                                }}
                              >
                                <Send size={11} />
                                <span>{resentId === user.id ? 'Sent!' : 'Resend'}</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <NameCell
                        user={user}
                        onSave={(id, name) => updateName.mutateAsync({ id, name })}
                      />
                    </td>
                    <td className="px-5 py-3.5">
                      <RoleCell
                        user={user}
                        isSelf={isSelf}
                        onSave={(id, role) => updateRole.mutateAsync({ id, role })}
                      />
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => setPinModal(user)}
                        className="inline-flex items-center gap-1.5"
                        style={{ fontSize: 12, background: 'none', border: 0, cursor: 'pointer', color: user.staff_pin ? 'var(--ink)' : 'var(--mute-2)', padding: 0 }}
                        title={user.staff_pin ? `PIN set — click to manage` : 'Set staff PIN'}
                      >
                        {user.staff_pin ? (
                          <>
                            <QrCode size={12} style={{ color: 'var(--ok)' }} />
                            <span className="mono" style={{ letterSpacing: '0.15em' }}>{user.staff_pin}</span>
                          </>
                        ) : (
                          <>
                            <KeyRound size={12} />
                            <span>Set PIN</span>
                          </>
                        )}
                      </button>
                    </td>
                    {/* Present — toggled by the user themselves (or admin) */}
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => setUserPresent.mutate({ id: user.id, isPresent: !user.is_present })}
                        disabled={setUserPresent.isPending}
                        title={user.is_present ? 'Mark as away' : 'Mark as present'}
                        className="inline-flex items-center gap-1.5"
                        style={{ fontSize: 12, background: 'none', border: 0, cursor: 'pointer', padding: 0, color: user.is_present ? 'var(--ok)' : 'var(--mute-2)' }}
                      >
                        <MapPin size={13} />
                        <span>{user.is_present ? 'Present' : 'Away'}</span>
                      </button>
                    </td>
                    {/* Active — admin only, can't disable self */}
                    <td className="px-5 py-3.5">
                      {isSelf ? (
                        <span style={{ fontSize: 12, color: 'var(--mute-2)' }}>—</span>
                      ) : (
                        <button
                          onClick={() => setUserActive.mutate({ id: user.id, isActive: !user.is_active })}
                          disabled={setUserActive.isPending}
                          title={user.is_active ? 'Disable account' : 'Enable account'}
                          className="inline-flex items-center gap-1.5"
                          style={{ fontSize: 12, background: 'none', border: 0, cursor: 'pointer', padding: 0, color: user.is_active ? 'var(--ok)' : 'var(--bad)' }}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: user.is_active ? 'var(--ok)' : 'var(--bad)', display: 'inline-block', flexShrink: 0 }} />
                          <span>{user.is_active ? 'Enabled' : 'Disabled'}</span>
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-3.5" style={{ color: 'var(--mute)' }}>{formatDate(user.created_at)}</td>
                    <td className="px-5 py-3.5 text-right">
                      {!isSelf && (
                        <button
                          onClick={() => setConfirmDelete(user)}
                          className="btn btn-sm btn-ghost"
                          style={{ color: 'var(--bad)' }}
                          title="Delete user"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add User Modal */}
      {addModal && (
        <Modal title="Add User" onClose={() => setAddModal(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <p style={{ margin: 0, fontSize: 12, color: 'var(--mute)', background: 'var(--hover)', borderRadius: 6, padding: '8px 12px' }}>
              An invitation email will be sent so the user can set their own password.
            </p>
            <div>
              <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="input"
                placeholder="Display name (optional)"
                maxLength={100}
              />
            </div>
            <div>
              <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="input"
                placeholder="staff@restaurant.com"
                required
              />
            </div>

            <div>
              <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>Role</label>
              <SelectField
                value={form.role}
                onChange={(v) => setForm((f) => ({ ...f, role: v }))}
                options={ROLES.map((r) => ({ value: r, label: r.charAt(0).toUpperCase() + r.slice(1) }))}
              />
              <p style={{ marginTop: 6, fontSize: 11.5, color: 'var(--mute)' }}>
                <strong>admin</strong> — full access ·{' '}
                <strong>staff</strong> — orders &amp; tables ·{' '}
                <strong>cashier</strong> — orders &amp; tables + bill alerts ·{' '}
                <strong>kitchen</strong> — kitchen queue only
              </p>
            </div>

            {formError && (
              <p className="rounded-[6px] px-3 py-2" style={{ fontSize: 12, color: 'var(--bad)', background: 'rgba(179,55,43,.06)' }}>
                {formError}
              </p>
            )}

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setAddModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" disabled={createUser.isPending} className="btn-primary flex-1">
                {createUser.isPending ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* PIN / QR Modal */}
      {pinModal && <PinModal user={pinModal} onClose={() => setPinModal(null)} />}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <Modal title="Delete User" onClose={() => setConfirmDelete(null)}>
          <p className="mb-5" style={{ fontSize: 13, color: 'var(--ink)' }}>
            Delete <strong>{confirmDelete.email}</strong>? They will immediately lose access.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(null)} className="btn-secondary flex-1">Cancel</button>
            <button
              onClick={() => handleDelete(confirmDelete.id)}
              disabled={deleteUser.isPending}
              className="flex-1 rounded-[6px] px-4 py-2 transition-colors disabled:opacity-60"
              style={{ fontSize: 13, fontWeight: 500, background: 'var(--bad)', color: '#fff', border: 0 }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              {deleteUser.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
