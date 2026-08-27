import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Trash2, TrendingUp, TrendingDown, Minus, ChevronDown } from 'lucide-react';
import { useDailyReport, useTrends, useItemProfitability, useStaffPerformance, useItemsTrend, useStaffTrend, useSalesSummary, useCollection, useItemGroups, useTableWiseSales, useNCSales } from '../hooks/useReports';
import { useCurrency } from '../context/CurrencyContext';
import { useTimezone } from '../context/TimezoneContext';

// ── Date helpers ──────────────────────────────────────────────────────────────

function localToday(iana) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: iana }).format(new Date());
}

function shiftDate(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function firstOfMonth(dateStr) {
  return dateStr.slice(0, 7) + '-01';
}

function lastOfMonth(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(y, m, 0).toISOString().slice(0, 10);
}

function prevMonth(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return d.toISOString().slice(0, 7) + '-01';
}

// ── Hover area chart (matches Overview style) ─────────────────────────────────

function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function HoverAreaChart({ data, labels, fmtVal, height = 220, color = 'var(--ink)' }) {
  const [hi, setHi] = useState(null);
  const ref = useRef(null);
  const lineRef = useRef(null);
  const areaRef = useRef(null);
  const prevDataRef = useRef(null);
  useEffect(() => {
    const prev = prevDataRef.current;
    prevDataRef.current = data;
    if (!prev || prev.length === 0) return;
    if (data.length === prev.length && data.every((v, i) => v === prev[i])) return;
    const line = lineRef.current;
    if (!line) return;
    const len = line.getTotalLength();
    line.style.transition = 'none';
    line.style.strokeDasharray = len;
    line.style.strokeDashoffset = len;
    line.getBoundingClientRect();
    line.style.transition = 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)';
    line.style.strokeDashoffset = '0';
    if (areaRef.current) {
      areaRef.current.style.opacity = '0';
      areaRef.current.style.transition = 'none';
      areaRef.current.getBoundingClientRect();
      areaRef.current.style.transition = 'opacity 0.8s ease 0.4s';
      areaRef.current.style.opacity = '1';
    }
  }, [data]);
  const padX = 6, padY = 20, W = 600;
  if (!data.length) return null;
  const max = Math.max(...data) * 1.08;
  const min = Math.min(...data) * 0.92;
  const span = max - min || 1;
  const innerW = W - padX * 2;
  const innerH = height - padY * 2;
  let pts = data.map((v, i) => [
    padX + (i / Math.max(data.length - 1, 1)) * innerW,
    padY + innerH - ((v - min) / span) * innerH,
  ]);
  if (pts.length === 1) pts = [[padX, pts[0][1]], [W - padX, pts[0][1]]];
  const pathD = smoothPath(pts);
  const areaD = `${pathD} L ${pts[pts.length - 1][0]},${height} L ${pts[0][0]},${height} Z`;
  const hp = hi != null ? pts[hi] : null;
  const leftPct = hp ? (hp[0] / W) * 100 : 0;
  const topPct  = hp ? (hp[1] / height) * 100 : 0;
  return (
    <div ref={ref} style={{ position: 'relative', cursor: 'crosshair' }}
      onMouseMove={(e) => {
        const r = ref.current.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        setHi(Math.round(ratio * (data.length - 1)));
      }}
      onMouseLeave={() => setHi(null)}
    >
      <svg width="100%" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          <linearGradient id="rp-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.14" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g, i) => (
          <line key={i} x1={padX} x2={W - padX} y1={padY + innerH * g} y2={padY + innerH * g}
            stroke="var(--line)" strokeWidth="1" />
        ))}
        <path ref={areaRef} d={areaD} fill="url(#rp-area-grad)" />
        <path ref={lineRef} d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {hp && (
          <>
            <line x1={hp[0]} x2={hp[0]} y1={padY} y2={height - padY} stroke="var(--line-2)" strokeWidth="1" />
            <circle cx={hp[0]} cy={hp[1]} r="4.5" fill="var(--paper)" stroke={color} strokeWidth="2" />
          </>
        )}
      </svg>
      {hp && (
        <div style={{
          position: 'absolute', pointerEvents: 'none',
          left: `${leftPct}%`, top: `${topPct}%`,
          transform: 'translate(-50%, -120%)',
          background: 'var(--ink)', color: 'var(--accent-on)',
          padding: '4px 9px', borderRadius: 7, fontSize: 11, whiteSpace: 'nowrap',
          boxShadow: '0 6px 18px rgba(20,18,10,.25)', zIndex: 5,
        }}>
          <span style={{ fontFamily: 'Geist Mono, monospace', fontWeight: 600 }}>{fmtVal(data[hi])}</span>
          {labels?.[hi] && <span style={{ opacity: 0.6, marginLeft: 5 }}>· {labels[hi]}</span>}
        </div>
      )}
      {labels && (
        <div className="flex justify-between mono" style={{ fontSize: 10, color: 'var(--mute-2)', marginTop: 4 }}>
          {labels.map((l, i) => (
            <span key={i} style={{ visibility: l ? 'visible' : 'hidden' }}>{l || '·'}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function PRESETS(today) {
  const ym = today.slice(0, 7);
  const prevYm = prevMonth(today).slice(0, 7);
  return [
    { label: 'Today',       from: today,           to: today },
    { label: 'Yesterday',   from: shiftDate(today, -1), to: shiftDate(today, -1) },
    { label: 'Last 7 days', from: shiftDate(today, -6), to: today },
    { label: 'Last 30 days',from: shiftDate(today, -29),to: today },
    { label: 'This month',  from: firstOfMonth(today),  to: today },
    { label: 'Last month',  from: prevYm + '-01',        to: lastOfMonth(prevYm + '-01') },
  ];
}

const CHANNELS = [
  { key: 'all',      label: 'All' },
  { key: 'dining',   label: 'Dine-in' },
  { key: 'takeaway', label: 'Takeaway' },
  { key: 'delivery', label: 'Delivery' },
];

function ChannelSwitcher({ channel, setChannel }) {
  const [open, setOpen] = useState(false);
  const active = CHANNELS.find((c) => c.key === channel) ?? CHANNELS[0];
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-[6px] px-3"
        style={{ height: 32, fontSize: 12, fontWeight: 500, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink)', cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        {active.label} <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 z-20 mt-1 py-1"
            style={{ top: '100%', minWidth: 130, background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.12)' }}
          >
            {CHANNELS.map(({ key, label }) => {
              const isActive = key === channel;
              return (
                <button
                  key={key}
                  onClick={() => { setChannel(key); setOpen(false); }}
                  className="w-full px-4 py-2 text-left"
                  style={{ fontSize: 13, color: 'var(--ink)', background: isActive ? 'var(--hover)' : 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: isActive ? 600 : 400 }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? 'var(--hover)' : 'none'; }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Reads the live CSS-variable values so chart colours follow the active theme.
// Falls back to the default palette tokens when no override is set.
function getSeriesColors() {
  const s = getComputedStyle(document.documentElement);
  const v = (name, fb) => s.getPropertyValue(name).trim() || fb;
  return [
    v('--ink',    '#0A0A0A'),
    v('--ok',     '#1f8a5b'),
    v('--warn',   '#b3781f'),
    v('--info',   '#1f5bb3'),
    v('--bad',    '#b3372b'),
    v('--mute',   '#6E6D67'),
    v('--ink-2',  '#2A2A28'),
    v('--mute-2', '#9B9A92'),
  ];
}

function SeriesLegend({ names }) {
  const colors = getSeriesColors();
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
      {names.map((name, i) => (
        <span key={name} className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'var(--mute)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: colors[i % colors.length], flexShrink: 0 }} />
          {name}
        </span>
      ))}
    </div>
  );
}

function periodLabel(period, group) {
  if (group === 'month') return period.slice(0, 7);
  if (group === 'week')  return `w/c ${period.slice(5)}`;
  return period.slice(5);
}

function pivotRows(rows, nameKey, valueKey) {
  const names = [...new Set(rows.map((r) => r[nameKey]))];
  const map = {};
  rows.forEach((r) => {
    if (!map[r.period]) map[r.period] = { period: r.period };
    map[r.period][r[nameKey]] = r[valueKey];
  });
  return { names, data: Object.values(map).sort((a, b) => a.period.localeCompare(b.period)) };
}

function GroupToggle({ group, setGroup }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ fontSize: 12, color: 'var(--mute)' }}>Group by</span>
      {['day', 'week', 'month'].map((g) => (
        <button
          key={g}
          onClick={() => setGroup(g)}
          className="rounded-[6px] px-3 capitalize transition-colors duration-75"
          style={{
            height: 30, fontSize: 12, fontWeight: 500,
            background: group === g ? 'var(--ink)' : 'var(--paper)',
            color:      group === g ? 'var(--paper)' : 'var(--mute)',
            border: '1px solid var(--line-2)',
          }}
        >
          {g}
        </button>
      ))}
    </div>
  );
}

// ── Small shared components ───────────────────────────────────────────────────

function KpiCard({ label, value, sub }) {
  return (
    <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, padding: '16px 20px', background: 'var(--paper)' }}>
      <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)', marginBottom: 6 }}>
        {label}
      </p>
      <p className="mono num" style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: sub ? 4 : 0 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--mute)' }}>{sub}</p>}
    </div>
  );
}

function EmptyChart({ height = 220 }) {
  return (
    <div className="flex items-center justify-center" style={{ height, fontSize: 13, color: 'var(--mute)' }}>
      No data for this period
    </div>
  );
}

function TableHead({ cols }) {
  return (
    <thead>
      <tr style={{ borderBottom: '1px solid var(--line)' }}>
        {cols.map(({ label, align = 'left' }) => (
          <th
            key={label}
            className={`px-5 py-3 text-${align}`}
            style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)', whiteSpace: 'nowrap' }}
          >
            {label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function MarginBadge({ pct }) {
  if (pct == null) return <span style={{ fontSize: 11, color: 'var(--mute)' }}>—</span>;
  const color = pct >= 60 ? 'var(--ok)' : pct >= 35 ? '#d97706' : 'var(--bad)';
  const Icon  = pct >= 60 ? TrendingUp : pct >= 35 ? Minus : TrendingDown;
  return (
    <span className="flex items-center justify-end gap-1" style={{ fontSize: 12, fontWeight: 600, color }}>
      <Icon size={11} />
      {pct.toFixed(1)}%
    </span>
  );
}

function Spinner() {
  return (
    <div className="py-16 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>
      Loading…
    </div>
  );
}

function ErrorMsg() {
  return (
    <div className="rounded-[8px] p-6 text-center" style={{ fontSize: 13, color: 'var(--bad)', background: 'rgba(179,55,43,.06)', border: '1px solid rgba(179,55,43,.15)' }}>
      Report unavailable — check your connection or try a different range
    </div>
  );
}

// ── Tab components ────────────────────────────────────────────────────────────

function OverviewTab({ from, to, daily, channel }) {
  const { format, currency } = useCurrency();
  const { timezone } = useTimezone();
  const isSingleDay = from === to;

  const fmtTick = useCallback((v) => {
    const val = parseFloat(v);
    if (val >= 1_000_000) return `${currency.symbol}${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000)     return `${currency.symbol}${(val / 1_000).toFixed(1)}k`;
    return `${currency.symbol}${val.toFixed(0)}`;
  }, [currency]);

  if (!daily) return null;

  const revenue  = parseFloat(daily.summary?.total_revenue ?? 0);
  const orders   = parseInt(daily.summary?.total_orders ?? 0, 10);
  const avgValue = orders > 0 ? revenue / orders : 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Revenue"        value={format(revenue)} />
        <KpiCard label="Orders"         value={orders} />
        <KpiCard label="Avg Order Value" value={orders > 0 ? format(avgValue) : '—'} />
      </div>

      {/* Top Items — only meaningful for single day; multi-day: direct to Items tab */}
      {isSingleDay ? (
        <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--paper)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Top Selling Items</p>
          </div>
          {daily.topItems?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontSize: 13 }}>
                <TableHead cols={[{ label: 'Item' }, { label: 'Category' }, { label: 'Sold', align: 'right' }, { label: 'Revenue', align: 'right' }]} />
                <tbody>
                  {daily.topItems.map((item, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td className="px-5 py-2.5" style={{ fontWeight: 500, color: 'var(--ink)' }}>{item.name}</td>
                      <td className="px-5 py-2.5 capitalize" style={{ color: 'var(--mute)' }}>{item.category}</td>
                      <td className="px-5 py-2.5 text-right mono num" style={{ color: 'var(--ink)' }}>{item.total_sold}</td>
                      <td className="px-5 py-2.5 text-right mono num" style={{ fontWeight: 600, color: 'var(--ink)' }}>{format(item.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-4" style={{ fontSize: 13, color: 'var(--mute)' }}>No completed orders on this date</p>
          )}
        </div>
      ) : (
        <div className="rounded-[8px] px-5 py-4" style={{ fontSize: 13, color: 'var(--mute)', border: '1px solid var(--line-2)', background: 'var(--paper)' }}>
          Switch to the <strong style={{ color: 'var(--ink)' }}>Trends</strong> tab for the revenue chart, or <strong style={{ color: 'var(--ink)' }}>Items</strong> for a full item breakdown across this date range.
        </div>
      )}

      {isSingleDay && <div className="grid gap-5 lg:grid-cols-2">
        {/* Revenue by Category */}
        <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, padding: 20, background: 'var(--paper)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 16 }}>Revenue by Category</p>
          {daily.byCategory?.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={daily.byCategory} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="category" tick={{ fontSize: 11, fill: 'var(--mute)' }} tickLine={false} />
                <YAxis width={64} tick={{ fontSize: 11, fill: 'var(--mute)' }} tickLine={false} axisLine={false}
                  domain={[0, (m) => Math.ceil(m * 1.2)]} tickFormatter={fmtTick} />
                <Tooltip formatter={(v) => [format(v)]} contentStyle={{ fontSize: 12, border: '1px solid var(--line-2)', borderRadius: 6, background: 'var(--paper)' }} />
                <Bar dataKey="revenue" fill="var(--ink)" radius={[3, 3, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </div>

        {/* Hourly Revenue (single day only) */}
        <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, padding: 20, background: 'var(--paper)' }}>
          <div className="flex items-baseline justify-between mb-4">
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Hourly Revenue</p>
            {isSingleDay && <span style={{ fontSize: 11, color: 'var(--mute)' }}>{timezone.label}</span>}
          </div>
          {isSingleDay && daily.hourly?.length > 0 ? (
            <HoverAreaChart
              data={daily.hourly.map((r) => parseFloat(r.revenue ?? 0))}
              labels={daily.hourly.map((r) => `${r.hour}`)}
              fmtVal={format}
              height={220}
            />
          ) : (
            <div className="flex h-[220px] items-center justify-center" style={{ fontSize: 13, color: 'var(--mute)' }}>
              No hourly data
            </div>
          )}
        </div>
      </div>}
    </div>
  );
}

function TrendsTab({ from, to, channel }) {
  const { data, isLoading, isError } = useTrends(from, to, 'day', channel);
  const { format, currency } = useCurrency();

  const fmtTick = useCallback((v) => {
    const val = parseFloat(v);
    if (val >= 1_000_000) return `${currency.symbol}${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000)     return `${currency.symbol}${(val / 1_000).toFixed(1)}k`;
    return `${currency.symbol}${val.toFixed(0)}`;
  }, [currency]);

  const totals = useMemo(() => {
    if (!data?.rows) return null;
    const revenue = data.rows.reduce((s, r) => s + r.revenue, 0);
    const orders  = data.rows.reduce((s, r) => s + r.orders, 0);
    return { revenue, orders, avg: orders > 0 ? revenue / orders : 0 };
  }, [data]);

  const chartData = data?.rows?.map((r) => ({ ...r, label: r.period.slice(5) }));

  return (
    <div className="space-y-5">
      {isLoading && <Spinner />}
      {isError   && <ErrorMsg />}

      {totals && (
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiCard label="Total Revenue"   value={format(totals.revenue)} />
          <KpiCard label="Total Orders"    value={totals.orders} />
          <KpiCard label="Avg Order Value" value={totals.orders > 0 ? format(totals.avg) : '—'} />
        </div>
      )}

      {chartData && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, padding: 20, background: 'var(--paper)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>Revenue</p>
            {chartData.length > 0 ? (
              <HoverAreaChart
                data={chartData.map((r) => parseFloat(r.revenue ?? 0))}
                labels={chartData.map((r) => r.label)}
                fmtVal={format}
                height={240}
              />
            ) : <EmptyChart height={240} />}
          </div>

          <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, padding: 20, background: 'var(--paper)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>Orders</p>
            {chartData.length > 0 ? (
              <HoverAreaChart
                data={chartData.map((r) => parseFloat(r.orders ?? 0))}
                labels={chartData.map((r) => r.label)}
                fmtVal={(v) => `${Math.round(v)}`}
                height={240}
              />
            ) : <EmptyChart height={240} />}
          </div>
        </div>
      )}
    </div>
  );
}

function ItemsTab({ from, to, setFrom, setTo, today, channel }) {
  const [view,  setView]  = useState('table');
  const [group, setGroup] = useState('day');
  const seriesColors = getSeriesColors();

  function handleGroupChange(g) {
    setGroup(g);
    if (g === 'month') { setFrom(shiftDate(today, -179)); setTo(today); }
    else if (g === 'week') { setFrom(shiftDate(today, -55)); setTo(today); }
    else { setFrom(shiftDate(today, -29)); setTo(today); }
  }
  const { format, formatOrDash, currency } = useCurrency();
  const [sort, setSort] = useState('revenue');

  const { data: profData, isLoading: profLoading, isError: profError } = useItemProfitability(from, to, channel);
  const { data: trendData, isLoading: trendLoading, isError: trendError } = useItemsTrend(
    view === 'chart' ? from : null,
    view === 'chart' ? to   : null,
    group,
    channel,
  );

  const fmtTick = useCallback((v) => {
    const val = parseFloat(v);
    if (val >= 1_000_000) return `${currency.symbol}${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000)     return `${currency.symbol}${(val / 1_000).toFixed(1)}k`;
    return `${currency.symbol}${val.toFixed(0)}`;
  }, [currency]);

  const items = useMemo(() => {
    if (!profData?.items) return [];
    return [...profData.items].sort((a, b) => {
      if (sort === 'margin')   return (b.margin_pct ?? -Infinity) - (a.margin_pct ?? -Infinity);
      if (sort === 'sold')     return b.total_sold - a.total_sold;
      if (sort === 'profit')   return (b.profit ?? -Infinity) - (a.profit ?? -Infinity);
      return b.revenue - a.revenue;
    });
  }, [profData, sort]);

  const { names: itemNames, data: chartData } = useMemo(() => {
    if (!trendData?.rows) return { names: [], data: [] };
    const pivoted = pivotRows(trendData.rows, 'name', 'revenue');
    return {
      names: pivoted.names,
      data:  pivoted.data.map((r) => ({ ...r, label: periodLabel(r.period, group) })),
    };
  }, [trendData, group]);

  const SortBtn = ({ field, label }) => (
    <button
      onClick={() => setSort(field)}
      style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em',
        color: sort === field ? 'var(--ink)' : 'var(--mute)',
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2,
        width: '100%',
      }}
    >
      {label}
      {sort === field && <ChevronDown size={10} />}
    </button>
  );

  const ViewToggle = () => (
    <div className="flex items-center gap-1">
      {['table', 'chart'].map((v) => (
        <button
          key={v}
          onClick={() => setView(v)}
          className="rounded-[6px] px-3 capitalize transition-colors duration-75"
          style={{
            height: 30, fontSize: 12, fontWeight: 500,
            background: view === v ? 'var(--ink)' : 'var(--paper)',
            color:      view === v ? 'var(--paper)' : 'var(--mute)',
            border: '1px solid var(--line-2)',
          }}
        >
          {v}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <ViewToggle />
        {view === 'chart' && <GroupToggle group={group} setGroup={handleGroupChange} />}
      </div>

      {view === 'table' && (
        <>
          {profLoading && <Spinner />}
          {profError   && <ErrorMsg />}
          {!profLoading && !profError && !items.length && (
            <p style={{ fontSize: 13, color: 'var(--mute)', padding: '32px 0' }}>No sales data for this period</p>
          )}
          {items.length > 0 && (
            <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--paper)' }}>
              <div className="overflow-x-auto">
                <table className="w-full" style={{ fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)' }}>
                      <th className="px-5 py-3 text-left"  style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)' }}>Item</th>
                      <th className="px-5 py-3 text-left"  style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)' }}>Category</th>
                      <th className="px-5 py-3 text-right"><SortBtn field="sold"    label="Sold" /></th>
                      <th className="px-5 py-3 text-right"><SortBtn field="revenue" label="Revenue" /></th>
                      <th className="px-5 py-3 text-right" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)' }}>Cost/Unit</th>
                      <th className="px-5 py-3 text-right"><SortBtn field="profit" label="Gross Profit" /></th>
                      <th className="px-5 py-3 text-right"><SortBtn field="margin" label="Margin" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td className="px-5 py-2.5" style={{ fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{item.name}</td>
                        <td className="px-5 py-2.5 capitalize" style={{ color: 'var(--mute)' }}>{item.category}</td>
                        <td className="px-5 py-2.5 text-right mono num" style={{ color: 'var(--ink)' }}>{item.total_sold}</td>
                        <td className="px-5 py-2.5 text-right mono num" style={{ fontWeight: 600, color: 'var(--ink)' }}>{format(item.revenue)}</td>
                        <td className="px-5 py-2.5 text-right mono num" style={{ color: 'var(--mute)' }}>
                          {item.cost_per_unit != null ? format(item.cost_per_unit) : <span style={{ color: 'var(--mute)', fontSize: 11 }}>no recipe</span>}
                        </td>
                        <td className="px-5 py-2.5 text-right mono num" style={{ color: item.profit != null ? (item.profit >= 0 ? 'var(--ok)' : 'var(--bad)') : 'var(--mute)' }}>
                          {formatOrDash(item.profit)}
                        </td>
                        <td className="px-5 py-2.5 text-right"><MarginBadge pct={item.margin_pct} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-5 py-3" style={{ fontSize: 11, color: 'var(--mute)', borderTop: '1px solid var(--line)' }}>
                Cost data only shown for items linked to a recipe. Link recipes in Menu → edit item.
              </p>
            </div>
          )}
        </>
      )}

      {view === 'chart' && (
        <>
          {trendLoading && <Spinner />}
          {trendError   && <ErrorMsg />}
          {!trendLoading && !trendError && chartData.length === 0 && <EmptyChart height={280} />}
          {chartData.length > 0 && (
            <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, padding: 20, background: 'var(--paper)' }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 16 }}>
                Revenue — top items
              </p>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--mute)' }} tickLine={false} interval="preserveStartEnd" />
                  <YAxis width={64} tick={{ fontSize: 11, fill: 'var(--mute)' }} tickLine={false} axisLine={false}
                    domain={[0, (m) => Math.ceil(m * 1.15)]} tickFormatter={fmtTick} />
                  <Tooltip
                    formatter={(v, name) => [format(v), name]}
                    contentStyle={{ fontSize: 12, border: '1px solid var(--line-2)', borderRadius: 6, background: 'var(--paper)', color: 'var(--ink)' }}
                    itemStyle={{ color: 'var(--ink)' }}
                  />
                  {itemNames.map((name, i) => (
                    <Line key={name} type="monotone" dataKey={name}
                      stroke={seriesColors[i % seriesColors.length]}
                      strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              <SeriesLegend names={itemNames} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StaffTab({ from, to, setFrom, setTo, today, channel }) {
  const [group, setGroup] = useState('day');
  const seriesColors = getSeriesColors();
  const { data, isLoading, isError }                = useStaffPerformance(from, to, channel);
  const { data: trendData, isLoading: trendLoading } = useStaffTrend(from, to, group, channel);

  function handleGroupChange(g) {
    setGroup(g);
    if (g === 'month') { setFrom(shiftDate(today, -179)); setTo(today); }
    else if (g === 'week') { setFrom(shiftDate(today, -55)); setTo(today); }
    else { setFrom(shiftDate(today, -29)); setTo(today); }
  }
  const { format } = useCurrency();

  const { names: staffNames, data: chartData } = useMemo(() => {
    if (!trendData?.rows) return { names: [], data: [] };
    const pivoted = pivotRows(trendData.rows, 'name', 'revenue_handled');
    return {
      names: pivoted.names,
      data:  pivoted.data.map((r) => ({ ...r, label: periodLabel(r.period, group) })),
    };
  }, [trendData, group]);

  if (isLoading) return <Spinner />;
  if (isError)   return <ErrorMsg />;
  if (!data?.staff?.length) return <p style={{ fontSize: 13, color: 'var(--mute)', padding: '32px 0' }}>No staff data for this period</p>;

  const totals = data.staff.reduce((a, s) => ({
    orders:  a.orders  + s.orders_created,
    revenue: a.revenue + s.revenue_handled,
  }), { orders: 0, revenue: 0 });

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <KpiCard label="Total Orders (period)"  value={totals.orders} />
        <KpiCard label="Total Revenue (period)" value={format(totals.revenue)} />
      </div>

      <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--paper)' }}>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: 13 }}>
            <TableHead cols={[
              { label: 'Name' },
              { label: 'Role' },
              { label: 'Orders Created', align: 'right' },
              { label: 'Revenue Handled', align: 'right' },
              { label: 'Avg Order Value', align: 'right' },
            ]} />
            <tbody>
              {data.staff.map((s) => {
                const avg = s.orders_created > 0 ? s.revenue_handled / s.orders_created : 0;
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td className="px-5 py-2.5" style={{ fontWeight: 500, color: 'var(--ink)' }}>
                      <div>{s.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--mute)' }}>{s.email}</div>
                    </td>
                    <td className="px-5 py-2.5 capitalize" style={{ color: 'var(--mute)', fontSize: 12 }}>{s.role}</td>
                    <td className="px-5 py-2.5 text-right mono num" style={{ color: 'var(--ink)' }}>{s.orders_created}</td>
                    <td className="px-5 py-2.5 text-right mono num" style={{ fontWeight: 600, color: 'var(--ink)' }}>{format(s.revenue_handled)}</td>
                    <td className="px-5 py-2.5 text-right mono num" style={{ color: 'var(--mute)' }}>
                      {s.orders_created > 0 ? format(avg) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revenue over time — per staff member */}
      {trendLoading && <Spinner />}
      {!trendLoading && chartData.length > 0 && staffNames.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {staffNames.map((name, i) => (
            <div key={name} style={{ border: '1px solid var(--line-2)', borderRadius: 8, padding: 20, background: 'var(--paper)' }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: seriesColors[i % seriesColors.length], marginBottom: 8 }}>{name}</p>
              <HoverAreaChart
                data={chartData.map((r) => parseFloat(r[name] ?? 0))}
                labels={chartData.map((r) => r.label)}
                fmtVal={format}
                height={180}
                color={seriesColors[i % seriesColors.length]}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SalesTab({ from, to, channel }) {
  const { data, isLoading, isError } = useSalesSummary(from, to, channel);
  const { format } = useCurrency();

  if (isLoading) return <Spinner />;
  if (isError)   return <ErrorMsg />;
  if (!data)     return null;

  const s = data.summary;
  const totalDiscount = (s.discount_amount || 0) + (s.coupon_discount_amount || 0) + (s.loyalty_discount_amount || 0);
  const avgOrderValue = s.total_orders > 0 ? s.total_revenue / s.total_orders : 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Revenue"    value={format(s.total_revenue)} />
        <KpiCard label="Total Orders"     value={s.total_orders} />
        <KpiCard label="Avg Order Value"  value={s.total_orders > 0 ? format(avgOrderValue) : '—'} />
        <KpiCard label="Items Sold"       value={s.total_items_sold} />
      </div>

      {/* Financial breakdown */}
      <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--paper)' }}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Sales Summary</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: 13 }}>
            <tbody>
              {[
                { label: 'Subtotal',        value: format(s.subtotal) },
                { label: 'Tax',             value: format(s.tax_amount) },
                { label: 'Service Charge',  value: format(s.service_charge) },
                { label: 'Packaging Fee',   value: format(s.packaging_fee) },
                { label: 'Discounts Given', value: `−${format(totalDiscount)}`, color: 'var(--ok)' },
                { label: 'Total Charged',   value: format(s.total_revenue), bold: true },
              ].map(({ label, value, color, bold }) => (
                <tr key={label} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td className="px-5 py-2.5" style={{ color: 'var(--mute)', fontWeight: bold ? 600 : 400 }}>{label}</td>
                  <td className="px-5 py-2.5 text-right mono num" style={{ fontWeight: bold ? 700 : 400, color: color || 'var(--ink)', fontSize: bold ? 14 : 13 }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sales by order type / channel */}
      {data.byChannel?.length > 0 && (
        <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--paper)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Sales by Order Type</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 13 }}>
              <TableHead cols={[
                { label: 'Channel' },
                { label: 'Orders',         align: 'right' },
                { label: 'Revenue',        align: 'right' },
                { label: 'Avg Order',      align: 'right' },
                { label: '% of Revenue',   align: 'right' },
              ]} />
              <tbody>
                {data.byChannel.map((r) => (
                  <tr key={r.channel} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td className="px-5 py-2.5 capitalize" style={{ fontWeight: 500, color: 'var(--ink)' }}>{r.channel}</td>
                    <td className="px-5 py-2.5 text-right mono num" style={{ color: 'var(--ink)' }}>{r.orders}</td>
                    <td className="px-5 py-2.5 text-right mono num" style={{ fontWeight: 600, color: 'var(--ink)' }}>{format(r.revenue)}</td>
                    <td className="px-5 py-2.5 text-right mono num" style={{ color: 'var(--mute)' }}>{format(r.avg_order_value)}</td>
                    <td className="px-5 py-2.5 text-right mono num" style={{ color: 'var(--mute)' }}>
                      {s.total_revenue > 0 ? ((r.revenue / s.total_revenue) * 100).toFixed(1) + '%' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CollectionTab({ from, to, channel }) {
  const { data, isLoading, isError } = useCollection(from, to, channel);
  const { format } = useCurrency();

  if (isLoading) return <Spinner />;
  if (isError)   return <ErrorMsg />;
  if (!data)     return null;

  const totalAmount = data.byMethod.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-5">
      {/* By payment method */}
      <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--paper)' }}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Collection by Payment Method</p>
        </div>
        {data.byMethod.length === 0 ? (
          <p className="px-5 py-4" style={{ fontSize: 13, color: 'var(--mute)' }}>No completed payments in this period</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 13 }}>
              <TableHead cols={[
                { label: 'Method' },
                { label: 'Orders',     align: 'right' },
                { label: 'Amount',     align: 'right' },
                { label: '% of Total', align: 'right' },
              ]} />
              <tbody>
                {data.byMethod.map((r) => (
                  <tr key={r.method} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td className="px-5 py-2.5 capitalize" style={{ fontWeight: 500, color: 'var(--ink)' }}>{r.method}</td>
                    <td className="px-5 py-2.5 text-right mono num" style={{ color: 'var(--ink)' }}>{r.orders}</td>
                    <td className="px-5 py-2.5 text-right mono num" style={{ fontWeight: 600, color: 'var(--ink)' }}>{format(r.amount)}</td>
                    <td className="px-5 py-2.5 text-right mono num" style={{ color: 'var(--mute)' }}>
                      {totalAmount > 0 ? ((r.amount / totalAmount) * 100).toFixed(1) + '%' : '—'}
                    </td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--paper-2)' }}>
                  <td className="px-5 py-2.5" style={{ fontWeight: 700, color: 'var(--ink)' }}>Total</td>
                  <td className="px-5 py-2.5 text-right mono num" style={{ fontWeight: 600, color: 'var(--ink)' }}>
                    {data.byMethod.reduce((s, r) => s + r.orders, 0)}
                  </td>
                  <td className="px-5 py-2.5 text-right mono num" style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 14 }}>{format(totalAmount)}</td>
                  <td className="px-5 py-2.5 text-right" style={{ color: 'var(--mute)', fontSize: 11 }}>100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Counter wise collection */}
      <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--paper)' }}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Counter Wise Collection</p>
        </div>
        {data.byCounter.length === 0 ? (
          <p className="px-5 py-4" style={{ fontSize: 13, color: 'var(--mute)' }}>No data for this period</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 13 }}>
              <TableHead cols={[
                { label: 'Staff' },
                { label: 'Role' },
                { label: 'Orders', align: 'right' },
                { label: 'Amount', align: 'right' },
                { label: 'Avg',    align: 'right' },
              ]} />
              <tbody>
                {data.byCounter.map((r) => (
                  <tr key={r.email} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td className="px-5 py-2.5" style={{ fontWeight: 500, color: 'var(--ink)' }}>
                      <div>{r.counter_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--mute)' }}>{r.email}</div>
                    </td>
                    <td className="px-5 py-2.5 capitalize" style={{ color: 'var(--mute)', fontSize: 12 }}>{r.role}</td>
                    <td className="px-5 py-2.5 text-right mono num" style={{ color: 'var(--ink)' }}>{r.orders}</td>
                    <td className="px-5 py-2.5 text-right mono num" style={{ fontWeight: 600, color: 'var(--ink)' }}>{format(r.amount)}</td>
                    <td className="px-5 py-2.5 text-right mono num" style={{ color: 'var(--mute)' }}>
                      {r.orders > 0 ? format(r.amount / r.orders) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ItemGroupsTab({ from, to, channel }) {
  const { data, isLoading, isError } = useItemGroups(from, to, channel);
  const { format } = useCurrency();
  const [sortTop, setSortTop] = useState('qty');

  if (isLoading) return <Spinner />;
  if (isError)   return <ErrorMsg />;
  if (!data)     return null;

  const totalRevenue = data.byGroup.reduce((s, r) => s + r.revenue, 0);
  const sortedTop = [...(data.topItems || [])].sort((a, b) =>
    sortTop === 'qty' ? b.total_sold - a.total_sold : b.revenue - a.revenue,
  );

  return (
    <div className="space-y-5">
      {/* Item group wise */}
      <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--paper)' }}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Item Group Wise Report</p>
        </div>
        {data.byGroup.length === 0 ? (
          <p className="px-5 py-4" style={{ fontSize: 13, color: 'var(--mute)' }}>No sales in this period</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 13 }}>
              <TableHead cols={[
                { label: 'Item Group' },
                { label: 'Orders',     align: 'right' },
                { label: 'Items Sold', align: 'right' },
                { label: 'Revenue',    align: 'right' },
                { label: '% of Total', align: 'right' },
              ]} />
              <tbody>
                {data.byGroup.map((r) => (
                  <tr key={r.item_group} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td className="px-5 py-2.5 capitalize" style={{ fontWeight: 500, color: 'var(--ink)' }}>{r.item_group}</td>
                    <td className="px-5 py-2.5 text-right mono num" style={{ color: 'var(--ink)' }}>{r.orders}</td>
                    <td className="px-5 py-2.5 text-right mono num" style={{ color: 'var(--ink)' }}>{r.items_sold}</td>
                    <td className="px-5 py-2.5 text-right mono num" style={{ fontWeight: 600, color: 'var(--ink)' }}>{format(r.revenue)}</td>
                    <td className="px-5 py-2.5 text-right mono num" style={{ color: 'var(--mute)' }}>
                      {totalRevenue > 0 ? ((r.revenue / totalRevenue) * 100).toFixed(1) + '%' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Top selling items */}
      <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--paper)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Top Selling Items</p>
          <div className="flex items-center gap-1">
            {[['qty', 'By Qty'], ['revenue', 'By Revenue']].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setSortTop(k)}
                className="rounded-[6px] px-3"
                style={{
                  height: 28, fontSize: 11, fontWeight: 500,
                  background: sortTop === k ? 'var(--ink)' : 'var(--paper)',
                  color:      sortTop === k ? 'var(--paper)' : 'var(--mute)',
                  border: '1px solid var(--line-2)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {sortedTop.length === 0 ? (
          <p className="px-5 py-4" style={{ fontSize: 13, color: 'var(--mute)' }}>No sales in this period</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 13 }}>
              <TableHead cols={[
                { label: '#',        align: 'right' },
                { label: 'Item' },
                { label: 'Category' },
                { label: 'Qty Sold', align: 'right' },
                { label: 'Revenue',  align: 'right' },
              ]} />
              <tbody>
                {sortedTop.map((item, i) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td className="px-5 py-2.5 text-right mono num" style={{ color: 'var(--mute-2)', fontWeight: 600 }}>{i + 1}</td>
                    <td className="px-5 py-2.5" style={{ fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{item.name}</td>
                    <td className="px-5 py-2.5 capitalize" style={{ color: 'var(--mute)' }}>{item.category}</td>
                    <td className="px-5 py-2.5 text-right mono num" style={{ color: 'var(--ink)' }}>{item.total_sold}</td>
                    <td className="px-5 py-2.5 text-right mono num" style={{ fontWeight: 600, color: 'var(--ink)' }}>{format(item.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TablesTab({ from, to }) {
  const { data, isLoading, isError } = useTableWiseSales(from, to);
  const { format } = useCurrency();

  if (isLoading) return <Spinner />;
  if (isError)   return <ErrorMsg />;
  if (!data)     return null;

  const totalRevenue = data.tables.reduce((s, r) => s + r.revenue, 0);

  return (
    <div className="space-y-5">
      {data.tables.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--mute)', padding: '32px 0' }}>No dining orders in this period</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard label="Tables Active"  value={data.tables.length} />
            <KpiCard label="Total Revenue"  value={format(totalRevenue)} />
            <KpiCard label="Total Orders"   value={data.tables.reduce((s, r) => s + r.orders, 0)} />
          </div>
          <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--paper)' }}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Table Wise Sale Summary</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontSize: 13 }}>
                <TableHead cols={[
                  { label: 'Table' },
                  { label: 'Orders',     align: 'right' },
                  { label: 'Revenue',    align: 'right' },
                  { label: 'Avg Order',  align: 'right' },
                  { label: '% of Total', align: 'right' },
                ]} />
                <tbody>
                  {data.tables.map((r) => (
                    <tr key={r.table_number} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td className="px-5 py-2.5" style={{ fontWeight: 500, color: 'var(--ink)' }}>Table {r.table_number}</td>
                      <td className="px-5 py-2.5 text-right mono num" style={{ color: 'var(--ink)' }}>{r.orders}</td>
                      <td className="px-5 py-2.5 text-right mono num" style={{ fontWeight: 600, color: 'var(--ink)' }}>{format(r.revenue)}</td>
                      <td className="px-5 py-2.5 text-right mono num" style={{ color: 'var(--mute)' }}>{format(r.avg_order_value)}</td>
                      <td className="px-5 py-2.5 text-right mono num" style={{ color: 'var(--mute)' }}>
                        {totalRevenue > 0 ? ((r.revenue / totalRevenue) * 100).toFixed(1) + '%' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function NCSalesTab({ from, to, channel }) {
  const { data, isLoading, isError } = useNCSales(from, to, channel);
  const { format } = useCurrency();
  const { iana } = useTimezone();

  if (isLoading) return <Spinner />;
  if (isError)   return <ErrorMsg />;
  if (!data)     return null;

  const { summary, orders } = data;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <KpiCard label="Cancelled Orders" value={summary.total_cancelled} />
        <KpiCard label="Value Cancelled"  value={format(summary.total_value_cancelled)} sub="Revenue lost to cancellations" />
      </div>

      <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--paper)' }}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>NC Sale Summary (Cancelled Orders)</p>
        </div>
        {orders.length === 0 ? (
          <p className="px-5 py-4" style={{ fontSize: 13, color: 'var(--mute)' }}>No cancelled orders in this period</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 13 }}>
              <TableHead cols={[
                { label: 'Order ID' },
                { label: 'Date/Time' },
                { label: 'Channel' },
                { label: 'Table' },
                { label: 'Created By' },
                { label: 'Order Value', align: 'right' },
              ]} />
              <tbody>
                {orders.map((o) => {
                  const dt = new Date(o.created_at).toLocaleString('en-US', {
                    timeZone: iana,
                    month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  });
                  return (
                    <tr key={o.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td className="px-5 py-2.5 mono num" style={{ fontSize: 11, color: 'var(--mute)' }}>#{o.id.slice(-6).toUpperCase()}</td>
                      <td className="px-5 py-2.5" style={{ fontSize: 12, color: 'var(--mute)', whiteSpace: 'nowrap' }}>{dt}</td>
                      <td className="px-5 py-2.5 capitalize" style={{ color: 'var(--ink)' }}>{o.channel}</td>
                      <td className="px-5 py-2.5" style={{ color: 'var(--mute)' }}>{o.table_number ? `Table ${o.table_number}` : '—'}</td>
                      <td className="px-5 py-2.5" style={{ color: 'var(--ink)' }}>{o.created_by || '—'}</td>
                      <td className="px-5 py-2.5 text-right mono num" style={{ color: o.order_value > 0 ? 'var(--bad)' : 'var(--mute)' }}>{format(o.order_value)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Trends', 'Items', 'Staff', 'Sales', 'Collection', 'Item Groups', 'Tables', 'NC Sales'];

export default function Reports() {
  const navigate = useNavigate();
  const { iana } = useTimezone();
  const today = localToday(iana);

  const STORAGE_KEY = 'reports_ui_state';
  const VALID_TABS     = new Set(TABS);
  const VALID_CHANNELS = new Set(['all', 'dining', 'takeaway', 'delivery']);

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const s = JSON.parse(raw);
      // Clamp saved dates to today — don't restore a future date
      const clamp = (d) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today) ? d : today;
      return {
        from:    clamp(s.from),
        to:      clamp(s.to),
        tab:     VALID_TABS.has(s.tab)         ? s.tab     : undefined,
        channel: VALID_CHANNELS.has(s.channel) ? s.channel : undefined,
      };
    } catch { return {}; }
  }

  const saved = useState(() => loadState())[0];

  const [from,    setFrom]    = useState(saved.from    ?? today);
  const [to,      setTo]      = useState(saved.to      ?? today);
  const [tab,     setTab]     = useState(saved.tab     ?? 'Overview');
  const [channel, setChannel] = useState(saved.channel ?? 'all');
  const [showPresets, setShowPresets] = useState(false);

  // Persist state changes
  function persist(patch) {
    try {
      const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
    } catch {}
  }

  function handleSetFrom(v)    { setFrom(v);    persist({ from: v }); }
  function handleSetTo(v)      { setTo(v);      persist({ to: v }); }
  function handleSetTab(v)     { setTab(v);     persist({ tab: v }); }
  function handleSetChannel(v) { setChannel(v); persist({ channel: v }); }

  const presets = PRESETS(today);
  const isSingleDay = from === to;
  const activePreset = presets.find((p) => p.from === from && p.to === to);

  function applyPreset(p) {
    handleSetFrom(p.from);
    handleSetTo(p.to);
    setShowPresets(false);
  }

  // For the Overview tab, we use the existing daily endpoint when single day,
  // or the trends endpoint summed for multi-day.
  const { data: dailyData, isLoading: dailyLoading, isError: dailyError } = useDailyReport(isSingleDay ? from : null, channel);

  // Build a synthetic daily-style summary for multi-day ranges from trends data
  const { data: rangeData, isLoading: rangeLoading, isError: rangeError } = useTrends(
    !isSingleDay ? from : null,
    !isSingleDay ? to   : null,
    'day',
    channel,
  );

  const overviewData = useMemo(() => {
    if (isSingleDay) return dailyData;
    if (!rangeData?.rows) return null;
    const revenue = rangeData.rows.reduce((s, r) => s + r.revenue, 0);
    const orders  = rangeData.rows.reduce((s, r) => s + r.orders, 0);
    return {
      summary: { total_revenue: revenue, total_orders: orders },
      topItems: [],
      byCategory: [],
      hourly: [],
    };
  }, [isSingleDay, dailyData, rangeData]);

  const overviewLoading = isSingleDay ? dailyLoading : rangeLoading;
  const overviewError   = isSingleDay ? dailyError   : rangeError;

  return (
    <div className="space-y-5">
      {/* Date range controls */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        {/* Dates + quick-range picker — all in one wrappable row */}
        <div className="flex flex-wrap items-center gap-2">
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--mute)', whiteSpace: 'nowrap' }}>From</label>
          <input
            type="date" value={from} max={to}
            onChange={(e) => handleSetFrom(e.target.value)}
            className="input"
            style={{ width: 130, minWidth: 0 }}
          />
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--mute)', whiteSpace: 'nowrap' }}>To</label>
          <input
            type="date" value={to} min={from} max={today}
            onChange={(e) => handleSetTo(e.target.value)}
            className="input"
            style={{ width: 130, minWidth: 0 }}
          />

          {/* Preset picker inline with dates */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowPresets((v) => !v)}
              className="flex items-center gap-1.5 rounded-[6px] px-3"
              style={{ height: 32, fontSize: 12, fontWeight: 500, border: '1px solid var(--line-2)', background: 'var(--paper)', color: activePreset ? 'var(--ink)' : 'var(--mute)', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {activePreset ? activePreset.label : 'Custom range'} <ChevronDown size={12} />
            </button>
            {showPresets && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowPresets(false)} />
                <div
                  className="absolute left-0 z-20 mt-1 py-1"
                  style={{ top: '100%', minWidth: 160, background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.12)' }}
                >
                  {presets.map((p) => {
                    const isActive = activePreset?.label === p.label;
                    return (
                      <button
                        key={p.label}
                        onClick={() => applyPreset(p)}
                        className="w-full px-4 py-2 text-left"
                        style={{ fontSize: 13, color: 'var(--ink)', background: isActive ? 'var(--hover)' : 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: isActive ? 600 : 400 }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? 'var(--hover)' : 'none'; }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Channel switcher */}
        <ChannelSwitcher channel={channel} setChannel={handleSetChannel} />

        {/* Action links — left on mobile, pushed right on sm+ */}
        <div className="flex items-center gap-2 sm:ml-auto">
          <button
            onClick={() => navigate('/waste-log')}
            className="flex items-center gap-1.5 rounded-[6px] px-3 text-[12px] font-medium transition-colors duration-75"
            style={{ height: 32, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--mute)', whiteSpace: 'nowrap' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--paper)'; e.currentTarget.style.color = 'var(--mute)'; }}
          >
            <Trash2 size={13} /> Waste Log
          </button>
          <button
            onClick={() => navigate('/costing')}
            className="flex items-center gap-1.5 rounded-[6px] px-3 text-[12px] font-medium transition-colors duration-75"
            style={{ height: 32, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--mute)', whiteSpace: 'nowrap' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--paper)'; e.currentTarget.style.color = 'var(--mute)'; }}
          >
            <TrendingUp size={13} /> Costing
          </button>
        </div>
      </div>

      {/* Tabs — scrollable so they never clip on narrow viewports */}
      <div className="scrollbar-none flex overflow-x-auto" style={{ gap: 2, borderBottom: '1px solid var(--line-2)' }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => handleSetTab(t)}
            style={{
              display: 'inline-flex', alignItems: 'center',
              fontSize: 13, fontWeight: 600, padding: '8px 14px',
              flexShrink: 0, whiteSpace: 'nowrap',
              background: 'none', border: 'none',
              boxShadow: tab === t ? 'inset 0 -2px 0 var(--accent)' : 'none',
              color: tab === t ? 'var(--ink)' : 'var(--mute)',
              cursor: 'pointer', transition: 'color 0.1s',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Overview' && (
        overviewLoading ? <Spinner /> :
        overviewError   ? <ErrorMsg /> :
        overviewData    ? <OverviewTab from={from} to={to} daily={overviewData} channel={channel} /> :
        null
      )}
      {tab === 'Trends'       && <TrendsTab      from={from} to={to} channel={channel} />}
      {tab === 'Items'        && <ItemsTab        from={from} to={to} setFrom={handleSetFrom} setTo={handleSetTo} today={today} channel={channel} />}
      {tab === 'Staff'        && <StaffTab        from={from} to={to} setFrom={handleSetFrom} setTo={handleSetTo} today={today} channel={channel} />}
      {tab === 'Sales'        && <SalesTab        from={from} to={to} channel={channel} />}
      {tab === 'Collection'   && <CollectionTab   from={from} to={to} channel={channel} />}
      {tab === 'Item Groups'  && <ItemGroupsTab   from={from} to={to} channel={channel} />}
      {tab === 'Tables'       && <TablesTab       from={from} to={to} />}
      {tab === 'NC Sales'     && <NCSalesTab      from={from} to={to} channel={channel} />}
    </div>
  );
}
