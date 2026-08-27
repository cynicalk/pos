import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search, Plus, X, MoreHorizontal, Download, Copy,
  Pencil, Trash2, ShoppingCart, Gift, Percent, Coffee,
  Settings2, TrendingUp, ArrowUpDown, Save, Check,
  Star, Ticket, Pizza, UtensilsCrossed, IceCream, Wine, Sandwich,
  Cookie, Apple, Cake,
} from 'lucide-react';
import { useLoyaltyCustomers, useCreateLoyaltyCustomer, useLoyaltyTransactions, useAdjustPoints, useDeleteLoyaltyCustomer, useUpdateLoyaltyCustomerName, useLoyaltyTiers, useLoyaltyRewards, useSaveLoyaltyTiers, useSaveLoyaltyRewards } from '../hooks/useLoyalty';
import { useSettings, useUpdateSetting } from '../hooks/useSettings';
import Modal from '../components/Modal';
import { fmtDate } from '../utils/dateUtils';

/* ─────────────────── Constants ─────────────────── */

const TIER_PALETTE = [
  { color: '#a06b2a', bg: '#f6ead6', gradA: '#b27d36', gradB: '#7c5219' },
  { color: '#5a6068', bg: '#ebedef', gradA: '#9ca3ad', gradB: '#5a6068' },
  { color: '#8a6a14', bg: '#f8eccb', gradA: '#d4a83a', gradB: '#8a6a14' },
  { color: '#3a3a47', bg: '#e6e6ec', gradA: '#5a5a6e', gradB: '#2a2a36' },
  { color: '#1a6b4a', bg: '#d6f0e5', gradA: '#27a567', gradB: '#1a6b4a' },
  { color: '#5b1aa0', bg: '#e8d6f5', gradA: '#8a3dd4', gradB: '#5b1aa0' },
];

const LABEL = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)', display: 'block', marginBottom: 5 };
const INPUT = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--paper-2)', color: 'var(--fg)', fontSize: 14, boxSizing: 'border-box' };
const COL   = '1.6fr 1fr .9fr .9fr .8fr 96px';

/* ─────────────────── Helpers ─────────────────── */

function deriveFromHex(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const bg = `rgba(${r},${g},${b},0.13)`;
  const lh = (c) => Math.min(255, c + 50).toString(16).padStart(2, '0');
  return { color: hex, bg, gradA: `#${lh(r)}${lh(g)}${lh(b)}`, gradB: hex };
}

function buildTiers(raw) {
  const sorted = [...raw].sort((a, b) => (a.min_points ?? a.min ?? 0) - (b.min_points ?? b.min ?? 0));
  return sorted.map((t, i) => {
    const derived = t.color ? deriveFromHex(t.color) : TIER_PALETTE[i % TIER_PALETTE.length];
    return { ...t, ...derived, min: t.min_points ?? t.min ?? 0 };
  });
}

const FALLBACK_TIER = { name: '—', color: '#999', bg: 'rgba(153,153,153,0.13)', gradA: '#bbb', gradB: '#999', min: 0 };

function getTier(pts, sortedTiers) {
  if (!sortedTiers.length) return FALLBACK_TIER;
  for (let i = sortedTiers.length - 1; i >= 0; i--) {
    if (pts >= sortedTiers[i].min) return sortedTiers[i];
  }
  return sortedTiers[0];
}

function initials(name, phone) {
  if (name) return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (phone ?? '?')[0].toUpperCase();
}

function fmtSince(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString([], { month: 'short', year: 'numeric' });
}

/* ─────────────────── Atoms ─────────────────── */

function PhoneCopyCell({ phone }) {
  const [copied, setCopied] = useState(false);
  function copy(e) {
    e.stopPropagation();
    navigator.clipboard.writeText(phone).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div className="flex items-center gap-1" style={{ minWidth: 0 }}>
      <span className="mono" style={{ fontSize: 12, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phone}</span>
      <button onClick={copy} title="Copy phone" style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 5, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: copied ? 'var(--ok)' : 'var(--mute)', opacity: copied ? 1 : 0.6 }}>
        {copied ? <Check size={11} /> : <Copy size={11} />}
      </button>
    </div>
  );
}

function TierBadge({ tier, fullWidth }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 6,
      fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
      color: tier.color, background: tier.bg, whiteSpace: 'nowrap',
      ...(fullWidth ? { width: '100%', justifyContent: 'center' } : {}),
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: .8, flexShrink: 0 }} />
      {tier.name}
    </span>
  );
}

function TierProgress({ pts, sortedTiers }) {
  const tier = getTier(pts, sortedTiers);
  const idx  = sortedTiers.indexOf(tier);
  const next = sortedTiers[idx + 1];
  if (!next) return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--mute)', marginBottom: 5, fontWeight: 500 }}>
        <span style={{ color: tier.color, fontWeight: 600 }}>{tier.name}</span><span>Max tier</span>
      </div>
      <div style={{ height: 6, background: '#e8e4db', borderRadius: 3 }}>
        <div style={{ height: '100%', width: '100%', borderRadius: 3, background: `linear-gradient(90deg,${tier.gradA},${tier.gradB})` }} />
      </div>
    </div>
  );
  const pct = Math.round(((pts - tier.min) / (next.min - tier.min)) * 100);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--mute)', marginBottom: 5, fontWeight: 500 }}>
        <span><strong style={{ color: 'var(--fg)' }}>{(next.min - pts).toLocaleString()} pts</strong> to {next.name}</span>
        <span>{pct}%</span>
      </div>
      <div style={{ height: 6, background: '#e8e4db', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.max(pct, 2)}%`, borderRadius: 3, background: `linear-gradient(90deg,${tier.gradA},${tier.gradB})`, transition: 'width .4s' }} />
      </div>
    </div>
  );
}

const ICON_MAP = {
  coffee: Coffee, percent: Percent, gift: Gift, star: Star, check: Check,
  cake: Cake, ticket: Ticket, pizza: Pizza, food: UtensilsCrossed,
  icecream: IceCream, wine: Wine, sandwich: Sandwich, cookie: Cookie,
  apple: Apple, shopping: ShoppingCart, settings: Settings2,
};

function RewardIcon({ type, size = 16 }) {
  const Icon = ICON_MAP[type?.toLowerCase?.()];
  if (Icon) return <Icon size={size} />;
  if (type?.trim()) return <span style={{ fontSize: size, lineHeight: 1, userSelect: 'none' }}>{type.trim()}</span>;
  return <Gift size={size} />;
}

/* ─────────────────── Detail panel ─────────────────── */

function DetailPanel({ customer, sortedTiers, rewards, onAdjust, onAddPoints, onRedeem, onClose }) {
  const { data: txData, isLoading: txLoading } = useLoyaltyTransactions(customer.id);
  const tier = getTier(customer.points_balance, sortedTiers);

  const lifetime = useMemo(() => {
    const txs = txData?.transactions ?? [];
    return {
      visits:   txs.filter((t) => t.type === 'earn').length,
      earned:   txs.filter((t) => t.type === 'earn').reduce((s, t) => s + t.points, 0),
      redeemed: txs.filter((t) => t.type === 'redeem').reduce((s, t) => s + Math.abs(t.points), 0),
    };
  }, [txData]);

  const memberId    = `LM-${String(customer.id).padStart(5, '0')}`;
  const memberSince = fmtSince(customer.created_at);

  function SH({ title, action }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--mute)', textTransform: 'uppercase' }}>{title}</h4>
        {action && <span onClick={action.fn} style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--mute)', cursor: 'pointer' }}>{action.label} →</span>}
      </div>
    );
  }

  return (
    <div className="lg:sticky lg:top-20" style={{ background: 'var(--paper)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      {/* Hero */}
      <div style={{ padding: '20px 20px 16px', background: 'linear-gradient(180deg,#fffdf6 0%,#ffffff 100%)', borderBottom: '1px solid var(--border)', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 4 }}>
          <button onClick={onAdjust} style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'transparent', border: '1px solid transparent', cursor: 'pointer', color: 'var(--mute)' }} title="Edit">
            <Pencil size={14} />
          </button>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'transparent', border: '1px solid transparent', cursor: 'pointer', color: 'var(--mute)' }} title="Close">
            <X size={14} />
          </button>
        </div>
        <div style={{ width: 54, height: 54, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 18, color: '#fff', marginBottom: 12, background: `linear-gradient(135deg,${tier.gradA},${tier.gradB})` }}>
          {initials(customer.name, customer.phone)}
        </div>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: '-.01em' }}>
          {customer.name || <span style={{ color: 'var(--mute)', fontStyle: 'italic', fontSize: 16 }}>No name</span>}
        </h2>
        <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--mute)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <TierBadge tier={tier} />
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#c0bab3', flexShrink: 0 }} />
          <span>{memberId}</span>
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#c0bab3', flexShrink: 0 }} />
          <span>Since {memberSince}</span>
        </div>
      </div>

      {/* Balance + progress */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'center', padding: '14px 20px', background: '#fffaee', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.025em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {customer.points_balance.toLocaleString()}<small style={{ fontSize: 13, fontWeight: 600, color: 'var(--mute)', marginLeft: 4 }}>pts</small>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--mute)', marginTop: 4 }}>available to redeem</div>
        </div>
        <TierProgress pts={customer.points_balance} sortedTiers={sortedTiers} />
      </div>

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        {[
          { label: ['Apply at', 'Checkout'], Icon: ShoppingCart, primary: true,  fn: onAdjust    },
          { label: ['Add Points'],           Icon: Plus,          primary: false, fn: onAddPoints },
          { label: ['Redeem'],               Icon: Gift,          primary: false, fn: () => onRedeem() },
        ].map(({ label, Icon, primary, fn }) => (
          <button key={label[0]} onClick={fn} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '10px 6px', borderRadius: 10, background: primary ? 'var(--accent)' : 'var(--paper-2)', border: '1px solid transparent', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: primary ? '#fff' : 'var(--fg)', lineHeight: 1.3 }}>
            <Icon size={18} />
            {label.map((l, i) => <span key={i}>{l}</span>)}
          </button>
        ))}
      </div>

      {/* Lifetime */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <SH title="Lifetime" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)' }}>
          {[
            { label: 'Visits',       v: txLoading ? '…' : lifetime.visits               },
            { label: 'Pts Earned',   v: txLoading ? '…' : lifetime.earned.toLocaleString()   },
            { label: 'Pts Redeemed', v: txLoading ? '…' : lifetime.redeemed.toLocaleString() },
          ].map(({ label, v }, i) => (
            <div key={label} style={{ paddingRight: i < 2 ? 12 : 0, paddingLeft: i > 0 ? 12 : 0, borderLeft: i > 0 ? '1px solid var(--border)' : 'none' }}>
              <strong style={{ display: 'block', fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v}</strong>
              <span style={{ fontSize: 11, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, marginTop: 2, display: 'block' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Rewards */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <SH title="Available Rewards" />
        {rewards.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--mute)', margin: 0 }}>No rewards configured yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rewards.map((r) => {
              const canRedeem = customer.points_balance >= r.points_cost;
              return (
                <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '34px 1fr auto', gap: 12, alignItems: 'center', padding: 10, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--paper)', opacity: canRedeem ? 1 : .55 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--paper-2)', display: 'grid', placeItems: 'center', color: 'var(--mute)' }}>
                    <RewardIcon type={r.icon} />
                  </div>
                  <div>
                    <strong style={{ fontSize: 13, fontWeight: 600, display: 'block' }}>{r.name}</strong>
                    <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>{r.description}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
                      {r.points_cost.toLocaleString()}<small style={{ fontSize: 10, color: 'var(--mute)', fontWeight: 500, marginLeft: 2 }}>pts</small>
                    </div>
                    <button disabled={!canRedeem} onClick={() => canRedeem && onRedeem(r.points_cost)} style={{ padding: '4px 10px', borderRadius: 7, border: canRedeem ? 'none' : '1px solid var(--border)', background: canRedeem ? 'var(--accent)' : 'transparent', color: canRedeem ? '#fff' : 'var(--mute)', fontWeight: 600, fontSize: 12.5, cursor: canRedeem ? 'pointer' : 'default', opacity: canRedeem ? 1 : .6 }}>
                      {canRedeem ? 'Redeem' : 'Locked'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent activity */}
      <div style={{ padding: '14px 20px' }}>
        <SH title="Recent Activity" />
        {txLoading ? (
          <p style={{ fontSize: 13, color: 'var(--mute)', margin: 0 }}>Loading…</p>
        ) : !txData?.transactions?.length ? (
          <p style={{ fontSize: 13, color: 'var(--mute)', margin: 0 }}>No transactions yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {txData.transactions.slice(0, 5).map((tx) => {
              const isEarn = tx.type === 'earn', isRedeem = tx.type === 'redeem';
              return (
                <div key={tx.id} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, display: 'grid', placeItems: 'center', background: isEarn ? '#e6f1ea' : isRedeem ? '#fbf1de' : 'var(--paper-2)', color: isEarn ? '#2f7a4a' : isRedeem ? '#a06b16' : 'var(--mute)' }}>
                    {isEarn ? <TrendingUp size={13} /> : isRedeem ? <Gift size={13} /> : <Settings2 size={13} />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: 13, fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.description || (isEarn ? 'Points earned' : isRedeem ? 'Points redeemed' : 'Adjustment')}
                    </strong>
                    <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>{fmtDate(tx.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: tx.points > 0 ? '#2f7a4a' : '#b3372b' }}>
                    {tx.points > 0 ? '+' : ''}{tx.points}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────── Rewards tab ─────────────────── */

const EMPTY_REWARD = { icon: '%', name: '', description: '', points_cost: '' };

function RewardsTab({ rewards, onSave, saving }) {
  const [list, setList]         = useState(() => rewards.map((r) => ({ ...r })));
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing]   = useState(null); // null = add, object = edit
  const [form, setForm]         = useState(EMPTY_REWARD);
  const [confirmDel, setConfirmDel] = useState(null);
  const [dirty, setDirty]       = useState(false);

  function openAdd() { setEditing(null); setForm(EMPTY_REWARD); setFormOpen(true); }
  function openEdit(r) { setEditing(r); setForm({ icon: r.icon, name: r.name, description: r.description || '', points_cost: String(r.points_cost) }); setFormOpen(true); }

  function handleSubmit(e) {
    e.preventDefault();
    const points_cost = parseInt(form.points_cost);
    if (!form.name.trim() || isNaN(points_cost) || points_cost <= 0) return;
    let next;
    if (editing) {
      next = list.map((r) => r.id === editing.id ? { ...editing, ...form, points_cost } : r);
    } else {
      next = [...list, { id: Date.now(), ...form, points_cost }];
    }
    setList(next);
    setDirty(true);
    setFormOpen(false);
  }

  function handleDelete() {
    const next = list.filter((r) => r.id !== confirmDel.id);
    setList(next);
    setDirty(true);
    setConfirmDel(null);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18, gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Rewards Catalogue</h2>
        <div style={{ flex: 1 }} />
        {dirty && (
          <button onClick={() => { onSave(list); setDirty(false); }} disabled={saving}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, border: 'none', background: 'var(--ok)', color: '#fff', fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>
            <Save size={14} /> {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
        <button onClick={openAdd} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>
          <Plus size={15} /> Add Reward
        </button>
      </div>

      {list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--mute)' }}>
          <Gift size={40} strokeWidth={1.2} />
          <p style={{ marginTop: 12 }}>No rewards yet. Add your first reward to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map((r) => (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '44px 1fr auto', gap: 14, alignItems: 'center', padding: '14px 18px', background: 'var(--paper)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--paper-2)', display: 'grid', placeItems: 'center', color: 'var(--mute)' }}>
                <RewardIcon type={r.icon} size={20} />
              </div>
              <div>
                <strong style={{ fontSize: 15, fontWeight: 600 }}>{r.name}</strong>
                {r.description && <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--mute)' }}>{r.description}</p>}
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>{r.points_cost.toLocaleString()} pts required</p>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => openEdit(r)} style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'transparent', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--mute)' }}>
                  <Pencil size={14} />
                </button>
                <button onClick={() => setConfirmDel(r)} style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'transparent', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--bad)' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <Modal onClose={() => setFormOpen(false)} title={editing ? 'Edit Reward' : 'Add Reward'}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={LABEL}>Icon</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--paper-2)', border: '1.5px solid var(--line-2)', borderRadius: 8, padding: '6px 10px' }}>
                <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0, minWidth: 24, textAlign: 'center' }}>
                  <RewardIcon type={form.icon} size={22} />
                </span>
                <input
                  value={form.icon}
                  onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                  placeholder="Type or paste an emoji…"
                  style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 15, color: 'var(--ink)' }}
                />
              </div>
            </div>
            <div>
              <label style={LABEL}>Name</label>
              <input style={INPUT} placeholder="e.g. Free Coffee" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <label style={LABEL}>Description (optional)</label>
              <input style={INPUT} placeholder="e.g. House blend · any size" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <label style={LABEL}>Points cost</label>
              <input style={INPUT} type="number" min="1" placeholder="e.g. 500" value={form.points_cost} onChange={(e) => setForm((f) => ({ ...f, points_cost: e.target.value }))} required />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setFormOpen(false)} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--fg)' }}>Cancel</button>
              <button type="submit" style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                {editing ? 'Save' : 'Add Reward'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirmDel && (
        <Modal onClose={() => setConfirmDel(null)} title="Delete Reward">
          <p style={{ margin: '0 0 20px', fontSize: 14 }}>Delete <strong>{confirmDel.name}</strong>? This cannot be undone.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setConfirmDel(null)} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleDelete} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--bad)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ─────────────────── Tiers tab ─────────────────── */

function TiersTab({ rawTiers, onSave, saving }) {
  const [list, setList] = useState(() => rawTiers.map((t) => ({ ...t, _key: String(t.id ?? `_new_${Date.now()}`) })));
  const [dirty, setDirty] = useState(false);
  const sorted = useMemo(() => buildTiers(list), [list]);

  function update(_key, field, value) {
    setList((prev) => prev.map((t) => t._key === _key ? { ...t, [field]: value } : t));
    setDirty(true);
  }

  function addTier() {
    const maxMin = Math.max(...list.map((t) => t.min_points ?? t.min ?? 0));
    const _key = `_new_${Date.now()}`;
    setList((prev) => [...prev, { _key, name: 'New Tier', min_points: maxMin + 1000 }]);
    setDirty(true);
  }

  function deleteTier(_key) {
    if (list.length <= 1) return;
    setList((prev) => prev.filter((t) => t._key !== _key));
    setDirty(true);
  }

  const sortedRaw = [...list].sort((a, b) => (a.min_points ?? a.min ?? 0) - (b.min_points ?? b.min ?? 0));

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div style={{ flex: 1 }} />
        {dirty && (
          <button onClick={() => { onSave(list); setDirty(false); }} disabled={saving} className="btn">
            <Save size={13} /> {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
        <button onClick={addTier} className="btn-primary">
          <Plus size={13} /> Add Tier
        </button>
      </div>

      <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 420 }}>

            {/* Header */}
            <div className="grid items-center px-4 py-2" style={{ gridTemplateColumns: '28px 110px 1fr 140px 40px', columnGap: 20, fontSize: 10, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.07em', background: 'var(--paper-2)', borderBottom: '1px solid var(--line)' }}>
              <span>Color</span>
              <span>Tier</span>
              <span>Name</span>
              <span>Min Points</span>
              <span />
            </div>

            {sortedRaw.map((raw, idx) => {
              const tier = sorted.find((t) => t._key === raw._key) ?? sorted[0];
              const isFirst = idx === 0;
              return (
                <div key={raw._key} className="grid items-center px-4 py-3" style={{ gridTemplateColumns: '28px 110px 1fr 140px 40px', columnGap: 20, borderBottom: idx < sortedRaw.length - 1 ? '1px solid var(--line)' : 'none', background: 'transparent', transition: 'background .1s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <input
                    type="color"
                    value={raw.color || tier.color}
                    onChange={(e) => update(raw._key, 'color', e.target.value)}
                    title="Pick tier colour"
                    style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--line-2)', cursor: 'pointer', padding: 2, background: 'none' }}
                  />
                  <div style={{ display: 'flex' }}><TierBadge tier={tier} fullWidth /></div>
                  <input
                    value={raw.name}
                    onChange={(e) => update(raw._key, 'name', e.target.value)}
                    className="input"
                    style={{ width: '100%' }}
                    placeholder="Tier name"
                  />
                  <input
                    type="number"
                    min={isFirst ? 0 : 1}
                    value={raw.min_points ?? raw.min ?? 0}
                    readOnly={isFirst}
                    onChange={(e) => !isFirst && update(raw._key, 'min_points', parseInt(e.target.value) || 0)}
                    className="input mono"
                    style={{ width: '100%', color: isFirst ? 'var(--mute)' : 'var(--ink)' }}
                    title={isFirst ? 'First tier always starts at 0' : ''}
                  />
                  <button
                    onClick={() => deleteTier(raw._key)}
                    disabled={list.length <= 1}
                    style={{ width: 28, height: 28, borderRadius: 6, display: 'grid', placeItems: 'center', background: 'transparent', border: 0, cursor: list.length <= 1 ? 'default' : 'pointer', color: list.length <= 1 ? 'var(--mute)' : 'var(--bad)', opacity: list.length <= 1 ? .35 : 1 }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}

          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── Programme Settings tab ─────────────────── */

function ProgrammeSettingsTab({ settings }) {
  const updateSetting = useUpdateSetting();

  const [ptsPerUnit, setPtsPerUnit] = useState(settings?.loyalty_points_per_unit ?? '10');
  const [ptsValue,   setPtsValue]   = useState(settings?.loyalty_points_value    ?? '0.1');
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState('');

  // Auto-initialize defaults the first time the tab is visited if not yet in DB
  useEffect(() => {
    if (!settings) return;
    const missing = !settings.loyalty_points_per_unit || !settings.loyalty_points_value;
    if (!missing) return;
    updateSetting.mutate({ key: 'loyalty_points_per_unit', value: settings.loyalty_points_per_unit ?? '10' });
    updateSetting.mutate({ key: 'loyalty_points_value',    value: settings.loyalty_points_value    ?? '0.1' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setError(''); setSaved(false);
    const pu = parseFloat(ptsPerUnit);
    const pv = parseFloat(ptsValue);
    if (isNaN(pu) || pu <= 0) { setError('Points per unit must be a positive number'); return; }
    if (isNaN(pv) || pv <= 0) { setError('Points value must be a positive number'); return; }
    try {
      await updateSetting.mutateAsync({ key: 'loyalty_points_per_unit', value: String(pu) });
      await updateSetting.mutateAsync({ key: 'loyalty_points_value',    value: String(pv) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to save settings');
    }
  }

  const examplePts  = Math.round(100 * parseFloat(ptsPerUnit || 0));
  const exampleVal  = (100 * parseFloat(ptsValue || 0)).toFixed(2);

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>Programme Settings</h2>
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Points earn rate */}
        <div style={{ background: 'var(--paper)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Earning Rate</h3>
          <div>
            <label style={LABEL}>Points earned per ₹ spent</label>
            <input style={INPUT} type="number" min="0.01" step="0.01" value={ptsPerUnit} onChange={(e) => setPtsPerUnit(e.target.value)} placeholder="e.g. 10" />
            <p style={{ fontSize: 12, color: 'var(--mute)', margin: '6px 0 0' }}>
              e.g. ₹100 order → {isNaN(examplePts) ? '—' : examplePts} points
            </p>
          </div>
        </div>

        {/* Points redeem value */}
        <div style={{ background: 'var(--paper)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Redemption Rate</h3>
          <div>
            <label style={LABEL}>Monetary value per point (₹)</label>
            <input style={INPUT} type="number" min="0.001" step="0.001" value={ptsValue} onChange={(e) => setPtsValue(e.target.value)} placeholder="e.g. 0.1" />
            <p style={{ fontSize: 12, color: 'var(--mute)', margin: '6px 0 0' }}>
              e.g. 100 points → ₹{isNaN(parseFloat(exampleVal)) ? '—' : exampleVal} discount
            </p>
          </div>
        </div>

        {error && <p style={{ color: 'var(--bad)', fontSize: 13, margin: 0 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="submit" disabled={updateSetting.isPending} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>
            <Save size={14} /> {updateSetting.isPending ? 'Saving…' : 'Save Settings'}
          </button>
          {saved && <span style={{ fontSize: 13, color: 'var(--ok)', alignSelf: 'center' }}>✓ Saved</span>}
        </div>
      </form>
    </div>
  );
}

/* ─────────────────── Main page ─────────────────── */

export default function Loyalty() {
  const [activeTab, setActiveTab]     = useState('members');
  const [search, setSearch]           = useState('');
  const [tierFilter, setTierFilter]   = useState('all');
  const [selected, setSelected]       = useState(null);
  const [addOpen, setAddOpen]         = useState(false);
  const [addForm, setAddForm]         = useState({ phone: '', name: '' });
  const [addError, setAddError]       = useState('');
  const [adjustOpen, setAdjustOpen]   = useState(false);
  const [adjustForm, setAdjustForm]   = useState({ points: '', description: '' });
  const [adjustError, setAdjustError] = useState('');

  const [sortBy, setSortBy]               = useState('points_desc');
  const [menuOpen, setMenuOpen]           = useState(null); // customer id
  const [menuPos, setMenuPos]             = useState({ top: 0, right: 0 });
  const [deleteTarget, setDeleteTarget]   = useState(null); // customer object
  const [renameTarget, setRenameTarget]   = useState(null); // customer object
  const [renameName, setRenameName]       = useState('');
  const menuRef = useRef(null);

  const { data: settings }                    = useSettings();
  const { data: customers = [], isLoading }   = useLoyaltyCustomers(search);
  const createC        = useCreateLoyaltyCustomer();
  const adjustMutation = useAdjustPoints(selected?.id);
  const deleteCustomer = useDeleteLoyaltyCustomer();
  const renameMutation = useUpdateLoyaltyCustomerName();
  const { data: rawTiers  = [] } = useLoyaltyTiers();
  const { data: rewards   = [] } = useLoyaltyRewards();
  const saveTiersMutation   = useSaveLoyaltyTiers();
  const saveRewardsMutation = useSaveLoyaltyRewards();

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(null);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const sortedTiers = useMemo(() => buildTiers(rawTiers), [rawTiers]);

  const selectedFresh = useMemo(
    () => customers.find((c) => c.id === selected?.id) ?? selected,
    [customers, selected],
  );

  const filtered = useMemo(() => {
    const list = tierFilter === 'all'
      ? customers
      : customers.filter((c) => getTier(c.points_balance, sortedTiers).name === tierFilter);
    return [...list].sort((a, b) => {
      if (sortBy === 'points_desc') return b.points_balance - a.points_balance;
      if (sortBy === 'points_asc')  return a.points_balance - b.points_balance;
      if (sortBy === 'name')        return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'newest')      return new Date(b.created_at) - new Date(a.created_at);
      return 0;
    });
  }, [customers, tierFilter, sortedTiers, sortBy]);

  const totalPts = useMemo(() => customers.reduce((s, c) => s + (c.points_balance || 0), 0), [customers]);

  async function handleAdd(e) {
    e.preventDefault();
    setAddError('');
    try {
      await createC.mutateAsync({ phone: addForm.phone.trim(), name: addForm.name.trim() || undefined });
      setAddForm({ phone: '', name: '' });
      setAddOpen(false);
    } catch (err) {
      setAddError(err?.response?.data?.error || 'Failed to create customer');
    }
  }

  function openAdjust(presetPts = '') {
    setAdjustForm({ points: presetPts === '' ? '' : String(presetPts), description: '' });
    setAdjustError('');
    setAdjustOpen(true);
  }

  async function handleAdjust(e) {
    e.preventDefault();
    setAdjustError('');
    const n = parseInt(adjustForm.points);
    if (isNaN(n) || n === 0) { setAdjustError('Enter a non-zero integer'); return; }
    try {
      await adjustMutation.mutateAsync({ points: n, description: adjustForm.description || undefined });
      setAdjustForm({ points: '', description: '' });
      setAdjustOpen(false);
    } catch (err) {
      setAdjustError(err?.response?.data?.error || 'Failed to adjust points');
    }
  }

  async function saveRewards(list) {
    await saveRewardsMutation.mutateAsync(list);
  }

  async function saveTiers(list) {
    await saveTiersMutation.mutateAsync(list);
  }

  const TABS = [
    { key: 'members',  label: 'Members',           count: customers.length   },
    { key: 'rewards',  label: 'Rewards',            count: rewards.length     },
    { key: 'tiers',    label: 'Tiers',              count: sortedTiers.length },
    { key: 'settings', label: 'Programme Settings', count: null, Icon: Settings2 },
  ];

  const TIER_CHIPS = [{ key: 'all', label: 'All' }, ...sortedTiers.map((t) => ({ key: t.name, label: t.name }))];

  return (
    <div className="space-y-5">

      {/* Page head */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-[22px] font-semibold m-0" style={{ letterSpacing: '-.015em', color: 'var(--ink)' }}>
            Loyalty Programme
          </h1>
          <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>
            {isLoading ? '…' : `${customers.length} member${customers.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto" style={{ flexShrink: 0 }}>
          <button className="btn shrink-0">
            <Download size={13} /> Export
          </button>
          <button onClick={() => setAddOpen(true)} className="btn-primary shrink-0">
            <Plus size={13} /> New Customer
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: 10 }}>
        {[
          { label: 'Total Members',      value: isLoading ? '…' : customers.length  },
          { label: 'Points Outstanding', value: isLoading ? '…' : totalPts.toLocaleString(), unit: 'pts' },
          { label: 'Active Rewards',     value: rewards.length     },
          { label: 'Configured Tiers',   value: sortedTiers.length },
        ].map(({ label, value, unit }) => (
          <div key={label} className="strip-tile" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--mute)' }}>{label}</span>
            <span className="mono num" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--ink)' }}>
              {value}
              {unit && <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--mute)', marginLeft: 3 }}>{unit}</span>}
            </span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--line-2)' }}>
        {TABS.map(({ key, label, count, Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            color: activeTab === key ? 'var(--ink)' : 'var(--mute)',
            borderBottom: activeTab === key ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1, background: 'none', border: 'none',
            borderBottomStyle: 'solid',
            borderBottomWidth: 2,
            borderBottomColor: activeTab === key ? 'var(--accent)' : 'transparent',
          }}>
            {Icon
              ? <><Icon size={15} className="sm:hidden" /><span className="hidden sm:inline">{label}</span></>
              : label
            }
            {count != null && (
              <span style={{
                background: activeTab === key ? 'var(--accent)' : 'var(--paper-2)',
                color: activeTab === key ? '#fff' : 'var(--mute)',
                fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 10,
              }}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Rewards tab ── */}
      {activeTab === 'rewards' && (
        <RewardsTab rewards={rewards} onSave={saveRewards} saving={saveRewardsMutation.isPending} />
      )}

      {/* ── Tiers tab ── */}
      {activeTab === 'tiers' && (
        <TiersTab rawTiers={rawTiers} onSave={saveTiers} saving={saveTiersMutation.isPending} />
      )}

      {/* ── Programme Settings tab ── */}
      {activeTab === 'settings' && (
        <ProgrammeSettingsTab settings={settings} />
      )}

      {/* ── Members tab ── */}
      {activeTab === 'members' && (
        <div className={`grid grid-cols-1 items-start gap-4${selectedFresh ? ' lg:grid-cols-[1fr_400px]' : ''}`}>

          <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 12, overflow: 'hidden' }}>

            {/* Toolbar */}
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-2)' }}>
              {/* Row 1: search + sort */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0" style={{ background: 'var(--paper-2)', borderRadius: 999, padding: '6px 12px' }}>
                  <Search size={14} style={{ color: 'var(--mute)', flexShrink: 0 }} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or phone…"
                    style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: 'var(--ink)' }} />
                </div>
                {/* Tier chips — inline on sm+, hidden on mobile */}
                <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
                  {TIER_CHIPS.map(({ key, label }) => (
                    <button key={key} onClick={() => setTierFilter(key)} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                      height: 28, padding: '0 10px', borderRadius: 999,
                      border: tierFilter === key ? '1px solid var(--accent)' : '1px solid var(--line-2)',
                      background: tierFilter === key ? 'var(--accent)' : 'var(--paper)',
                      color: tierFilter === key ? '#fff' : 'var(--ink-2)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>
                      {label}
                    </button>
                  ))}
                </div>
                <button className="btn btn-sm shrink-0" onClick={() =>
                  setSortBy((s) => s === 'points_desc' ? 'points_asc' : s === 'points_asc' ? 'name' : s === 'name' ? 'newest' : 'points_desc')
                }>
                  <ArrowUpDown size={12} style={{ color: 'var(--mute)' }} />
                  {{ points_desc: 'Points ↓', points_asc: 'Points ↑', name: 'Name A–Z', newest: 'Newest' }[sortBy]}
                </button>
              </div>
              {/* Row 2: tier chips — scrollable on mobile only */}
              <div className="flex sm:hidden items-center gap-1.5 mt-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
                {TIER_CHIPS.map(({ key, label }) => (
                  <button key={key} onClick={() => setTierFilter(key)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                    height: 28, padding: '0 10px', borderRadius: 999,
                    border: tierFilter === key ? '1px solid var(--accent)' : '1px solid var(--line-2)',
                    background: tierFilter === key ? 'var(--accent)' : 'var(--paper)',
                    color: tierFilter === key ? '#fff' : 'var(--ink-2)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* List header — desktop only */}
            <div className="hidden sm:grid" style={{ gridTemplateColumns: COL, gap: 14, padding: '8px 16px', background: 'var(--paper-2)', fontSize: 10, fontWeight: 700, letterSpacing: '.07em', color: 'var(--mute)', textTransform: 'uppercase', borderBottom: '1px solid var(--line-2)' }}>
              <div>Member</div><div>Phone</div><div>Tier</div>
              <div style={{ textAlign: 'right' }}>Points</div><div>Since</div>
              <div style={{ textAlign: 'right' }}>Actions</div>
            </div>

            {/* Rows */}
            {isLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--mute)', fontSize: 13 }}>Loading…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '60px', textAlign: 'center', color: 'var(--mute)' }}>
                <Gift size={36} strokeWidth={1.2} style={{ margin: '0 auto' }} />
                <p style={{ marginTop: 10, fontSize: 13 }}>{search ? 'No customers match your search.' : 'No loyalty customers yet.'}</p>
              </div>
            ) : filtered.map((c) => {
              const tier  = getTier(c.points_balance, sortedTiers);
              const isSel = selected?.id === c.id;
              const rowBg = isSel ? 'var(--paper-2)' : 'var(--paper)';
              const menuBtn = (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (menuOpen === c.id) { setMenuOpen(null); return; }
                    const r = e.currentTarget.getBoundingClientRect();
                    setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
                    setMenuOpen(c.id);
                  }}
                  style={{ width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center', background: menuOpen === c.id ? 'var(--paper-2)' : 'transparent', border: '1px solid var(--line-2)', cursor: 'pointer', color: 'var(--mute)', flexShrink: 0 }}
                >
                  <MoreHorizontal size={13} />
                </button>
              );
              const contextMenu = menuOpen === c.id && (
                <div ref={menuRef} style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 9999, minWidth: 160, overflow: 'hidden' }}>
                  {[
                    { label: 'View Details',  fn: () => { setSelected(c); setMenuOpen(null); } },
                    { label: 'Adjust Points', fn: () => { setSelected(c); openAdjust(); setMenuOpen(null); } },
                    { label: 'Edit Name',     fn: () => { setRenameTarget(c); setRenameName(c.name || ''); setMenuOpen(null); } },
                    { label: 'Delete',        fn: () => { setDeleteTarget(c); setMenuOpen(null); }, danger: true },
                  ].map(({ label, fn, danger }) => (
                    <button key={label} onClick={fn} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 13, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', color: danger ? 'var(--bad)' : 'var(--ink)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = danger ? 'rgba(179,55,43,.06)' : 'var(--hover)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              );
              return (
                <div key={c.id}>
                  {/* Mobile card row */}
                  <div className="sm:hidden" onClick={() => setSelected(isSel ? null : c)}
                    style={{ padding: '11px 14px', borderBottom: '1px solid var(--line-2)', cursor: 'pointer', background: rowBg }}>
                    <div className="flex items-center gap-3">
                      <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 12, color: '#fff', background: `linear-gradient(135deg,${tier.gradA},${tier.gradB})` }}>
                        {initials(c.name, c.phone)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>
                          {c.name || <span style={{ color: 'var(--mute)', fontStyle: 'italic' }}>No name</span>}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--mute)', marginTop: 1 }}>{c.phone}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <TierBadge tier={tier} />
                        <div className="mono num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginTop: 3 }}>
                          {c.points_balance.toLocaleString()} <span style={{ fontSize: 10, color: 'var(--mute)', fontWeight: 500 }}>pts</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => { setSelected(c); openAdjust(); }} className="btn btn-sm">Adjust</button>
                        {menuBtn}
                        {contextMenu}
                      </div>
                    </div>
                  </div>

                  {/* Desktop table row */}
                  <div className="hidden sm:grid" onClick={() => setSelected(isSel ? null : c)}
                    style={{ gridTemplateColumns: COL, gap: 14, padding: '12px 16px', alignItems: 'center', borderBottom: '1px solid var(--line-2)', cursor: 'pointer', background: rowBg, transition: 'background .1s' }}
                    onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = 'var(--hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = rowBg; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 12, color: '#fff', background: `linear-gradient(135deg,${tier.gradA},${tier.gradB})` }}>
                        {initials(c.name, c.phone)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>
                          {c.name || <span style={{ color: 'var(--mute)', fontStyle: 'italic' }}>No name</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 1 }}>{`LM-${String(c.id).padStart(5, '0')}`}</div>
                      </div>
                    </div>
                    <PhoneCopyCell phone={c.phone} />
                    <div><TierBadge tier={tier} /></div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="mono num" style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{c.points_balance.toLocaleString()}</div>
                      <div style={{ fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.07em' }}>pts</div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--mute)' }}>{fmtSince(c.created_at)}</div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => { setSelected(c); openAdjust(); }} className="btn btn-sm">Adjust</button>
                      {menuBtn}
                      {contextMenu}
                    </div>
                  </div>
                </div>
              );
            })}

            {filtered.length > 0 && (
              <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--mute)' }}>
                Showing {filtered.length} of {customers.length} member{customers.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selectedFresh && (
            <DetailPanel
              customer={selectedFresh}
              sortedTiers={sortedTiers}
              rewards={rewards}
              onAdjust={() => openAdjust()}
              onAddPoints={() => openAdjust()}
              onRedeem={(pts) => openAdjust(pts ? -pts : '')}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
      )}


      {/* Add Customer Modal */}
      {addOpen && (
        <Modal onClose={() => setAddOpen(false)} title="Add Loyalty Customer">
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <label style={LABEL}>Phone number</label>
              <input className="input w-full" type="tel" placeholder="+1234567890" value={addForm.phone} onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))} required />
            </div>
            <div>
              <label style={LABEL}>Name (optional)</label>
              <input className="input w-full" placeholder="Customer name" value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            {addError && <p style={{ color: 'var(--bad)', fontSize: 13, margin: 0 }}>{addError}</p>}
            <div className="flex gap-2 justify-end pt-1">
              <button type="button" onClick={() => setAddOpen(false)} className="btn">Cancel</button>
              <button type="submit" disabled={createC.isPending} className="btn-primary">
                {createC.isPending ? 'Adding…' : 'Add Customer'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Customer Modal */}
      {deleteTarget && (
        <Modal onClose={() => setDeleteTarget(null)} title="Delete Customer">
          <p style={{ margin: '0 0 6px', fontSize: 14 }}>
            Delete <strong>{deleteTarget.name || deleteTarget.phone}</strong>? This will permanently remove the customer and all their points history.
          </p>
          <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--bad)' }}>This cannot be undone.</p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setDeleteTarget(null)} className="btn">Cancel</button>
            <button
              disabled={deleteCustomer.isPending}
              onClick={async () => {
                await deleteCustomer.mutateAsync(deleteTarget.id);
                if (selected?.id === deleteTarget.id) setSelected(null);
                setDeleteTarget(null);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 16px', height: 30, borderRadius: 8, border: 'none', background: 'var(--bad)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              {deleteCustomer.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}

      {/* Rename Customer Modal */}
      {renameTarget && (
        <Modal onClose={() => setRenameTarget(null)} title="Edit Name">
          <form onSubmit={async (e) => {
            e.preventDefault();
            await renameMutation.mutateAsync({ id: renameTarget.id, name: renameName });
            setRenameTarget(null);
          }} className="space-y-3">
            <div>
              <label style={LABEL}>Name</label>
              <input className="input w-full" value={renameName} onChange={(e) => setRenameName(e.target.value)} placeholder="Customer name" autoFocus required />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button type="button" onClick={() => setRenameTarget(null)} className="btn">Cancel</button>
              <button type="submit" disabled={renameMutation.isPending} className="btn-primary">
                {renameMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Adjust Points Modal */}
      {adjustOpen && selectedFresh && (
        <Modal onClose={() => setAdjustOpen(false)} title={`Adjust Points — ${selectedFresh.name || selectedFresh.phone}`}>
          <form onSubmit={handleAdjust} className="space-y-3">
            <p style={{ margin: 0, fontSize: 13, color: 'var(--mute)' }}>
              Current balance: <strong style={{ color: 'var(--ink)' }}>{selectedFresh.points_balance.toLocaleString()} pts</strong>
            </p>
            <div>
              <label style={LABEL}>Points adjustment (use − to deduct)</label>
              <input className="input w-full" type="number" placeholder="+50 or -20" value={adjustForm.points} onChange={(e) => setAdjustForm((f) => ({ ...f, points: e.target.value }))} required />
            </div>
            <div>
              <label style={LABEL}>Reason (optional)</label>
              <input className="input w-full" placeholder="e.g. Promotional bonus" value={adjustForm.description} onChange={(e) => setAdjustForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            {adjustError && <p style={{ color: 'var(--bad)', fontSize: 13, margin: 0 }}>{adjustError}</p>}
            <div className="flex gap-2 justify-end pt-1">
              <button type="button" onClick={() => setAdjustOpen(false)} className="btn">Cancel</button>
              <button type="submit" disabled={adjustMutation.isPending} className="btn-primary">
                {adjustMutation.isPending ? 'Applying…' : 'Apply'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
