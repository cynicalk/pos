import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  UtensilsCrossed,
  Grid3X3,
  ClipboardList,
  BarChart2,
  Users,
  Settings,
  ScrollText,
  LogOut,
  Menu,
  X,
  KeyRound,
  Wallet,
  FlaskConical,
  BookOpen,
  Package,
  Trash2,
  TrendingUp,
  ChefHat,
  ChevronDown,
  Layers,
  QrCode,
  MapPin,
  Tag,
  Gift,
  Megaphone,
  MessageSquare,
  Maximize2,
  Minimize2,
  Plus,
  Printer,
  Sparkles,
  Scale,
  ClipboardCheck,
  Hourglass,
  LineChart,
  Radar,
  Building2,
  ShoppingCart,
  Plug,
  CircleDashed,
  Coins,
  Grid2X2,
  Truck,
  ShieldCheck,
  BookMarked,
  ExternalLink,
  Flame,
  FileSpreadsheet,
} from 'lucide-react';
import QRCode from 'qrcode';
import api from '../api/client';
import { printKOTSilent } from '../utils/printReceipt';
import OfflineBanner from './OfflineBanner';
import SyncBadge from './SyncBadge';
import ChangePasswordModal from './ChangePasswordModal';
import NotificationBell from './NotificationBell';
import ToastContainer from './ToastNotification';
import DeliveryAlertContainer from './DeliveryAlert';
import Modal from './Modal';
import NewOrderModal from './NewOrderModal';
import ChatBubble from './AIChat/ChatBubble';
import { ErrorBoundary } from './ErrorBoundary';
import { useWebSocket } from '../hooks/useWebSocket';
import { useNotifications } from '../hooks/useNotifications';
import { useAuth } from '../hooks/useAuth';
import { useMeProfile, useSetUserPresent } from '../hooks/useUsers';
import { useSettings, useUpdateSetting } from '../hooks/useSettings';
import { useAIStatus } from '../hooks/useAI';
import { PLANNED_FEATURES } from '../lib/plannedFeatures';

// ── Theme helpers ──────────────────────────────────────────────────────────────

function hexLuminance(hex) {
  try {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  } catch { return 0; }
}

function contrastColor(hex) {
  return hexLuminance(hex) > 0.179 ? '#0A0A0A' : '#FAFAF8';
}

function darkenHex(hex, delta) {
  try {
    const clamp = (v) => Math.max(0, Math.min(255, v));
    const d = Math.round(delta * 255);
    const r = clamp(parseInt(hex.slice(1, 3), 16) + d).toString(16).padStart(2, '0');
    const g = clamp(parseInt(hex.slice(3, 5), 16) + d).toString(16).padStart(2, '0');
    const b = clamp(parseInt(hex.slice(5, 7), 16) + d).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  } catch { return hex; }
}

// Nav children for the Tier-3 shells, derived from the one registry so a
// feature can never appear in the nav without a route or vice versa.
const PLANNED_BY_GROUP = PLANNED_FEATURES.reduce((acc, f) => {
  (acc[f.group] ||= []).push({ to: f.path, label: f.title, Icon: CircleDashed });
  return acc;
}, {});

// The guest dine-in app runs as its own web app on port 3001 (see guest-app/).
// Same convention as the QR menu card (VITE_MENU_URL): a configurable URL that
// defaults to the current host on the guest app's port for local dev.
const GUEST_APP_URL =
  import.meta.env.VITE_GUEST_URL ||
  `${window.location.protocol}//${window.location.hostname}:3001`;

const ALL_NAV = [
  { to: '/overview', label: 'Overview', Icon: LayoutDashboard, end: true, adminOnly: false },
  { to: '/menu',     label: 'Menu',     Icon: UtensilsCrossed,            adminOnly: false },
  { to: '/tables',   label: 'Tables',   Icon: Grid3X3,         end: true,  adminOnly: false },
  { to: '/tables/waitlist', label: 'Waitlist', Icon: Hourglass,           adminOnly: false, staffOnly: true },
  { to: '/orders',   label: 'Orders',   Icon: ClipboardList,              adminOnly: false },
  { to: '/shift',    label: 'Shift',    Icon: Wallet,                     adminOnly: false, staffOnly: true },
  { to: '/ai-chat',  label: 'AI Assistant', Icon: Sparkles,               adminOnly: false, staffOnly: true },
  { to: '/actions',  label: 'Actions',  Icon: Megaphone, adminOnly: true },
  // Top level, not inside a group: an operator with several outlets opens this
  // before anything else, and burying it under Analytics would make the
  // multi-outlet view harder to reach than any single outlet's report.
  { to: '/group',    label: 'Group',    Icon: Building2, adminOnly: true },
  {
    type: 'group', key: 'analytics', label: 'Analytics', Icon: BarChart2, adminOnly: true,
    children: [
      { to: '/reports',  label: 'Reports',   Icon: BarChart2  },
      { to: '/history',  label: 'History',   Icon: ScrollText },
      { to: '/waste-log',    label: 'Waste Log', Icon: Trash2     },
      { to: '/costing',  label: 'Costing',   Icon: TrendingUp },
      { to: '/variance', label: 'Variance',  Icon: Scale      },
      { to: '/economics',     label: 'Economics',     Icon: Coins   },
      { to: '/payouts',       label: 'Payouts',       Icon: Wallet  },
      { to: '/accounting',    label: 'Accounting Export', Icon: FileSpreadsheet },
      { to: '/menu-insights', label: 'Menu Insights', Icon: Grid2X2 },
    ],
  },
  {
    type: 'group', key: 'rms', label: 'Recipe Mgmt', Icon: ChefHat, adminOnly: true,
    children: [
      { to: '/ingredients', label: 'Ingredients', Icon: FlaskConical },
      { to: '/inventory',   label: 'Ledger',       Icon: Layers      },
      { to: '/recipes',     label: 'Recipes',      Icon: BookOpen    },
      { to: '/combos',      label: 'Combos',       Icon: Package     },
      { to: '/stocktake',   label: 'Stocktake',    Icon: ClipboardCheck },
      { to: '/procurement', label: 'Procurement',  Icon: Truck },
    ],
  },
  {
    type: 'group', key: 'marketing', label: 'Marketing', Icon: Megaphone, adminOnly: true,
    children: [
      { to: '/coupons',  label: 'Coupons',  Icon: Tag            },
      { to: '/loyalty',  label: 'Loyalty',  Icon: Gift           },
      { to: '/reviews',  label: 'Reviews',  Icon: MessageSquare  },
      { to: '/rankings', label: 'Rankings', Icon: Radar           },
      { to: '/guests',   label: 'Guests',   Icon: Users           },
    ],
  },
  // Not-yet-possible features (MERGE_PLAN.md §2 Tier 3). They sit in the nav
  // where they will eventually live rather than in a "coming soon" bucket, so
  // the information architecture is settled once — and each screen states
  // plainly why it is empty instead of showing invented numbers.
  {
    type: 'group', key: 'forecasting', label: 'Forecasting', Icon: LineChart, adminOnly: true,
    // Demand and the prep sheet are built now, so they come first and carry a
    // solid icon rather than the dashed one the remaining shells use. They are
    // listed here rather than derived from PLANNED_FEATURES because they are no
    // longer in it — which is also what gives them a page title and a header
    // breadcrumb, both of which come from the nav.
    children: [
      { to: '/forecast/demand',     label: 'Demand Forecast',    Icon: LineChart },
      { to: '/forecast/prep-sheet', label: 'Prep Sheet',         Icon: ClipboardList },
      { to: '/forecast/inventory',  label: 'Inventory Forecast', Icon: Package },
      { to: '/forecast/reorder',    label: 'Auto Reorder',       Icon: ShoppingCart },
      { to: '/forecast/shift-planning', label: 'Shift Planning',      Icon: Users },
      { to: '/forecast/scheduling',     label: 'Cost Scheduling',     Icon: Coins },
      ...(PLANNED_BY_GROUP['Forecasting'] || []),
    ],
  },
  {
    type: 'group', key: 'market', label: 'Market Intel', Icon: Radar, adminOnly: true,
    children: PLANNED_BY_GROUP['Market Intel'],
  },
  // The guest-facing menu card and the one thing about it that cannot be built.
  // Grouped together on purpose: an operator setting up allergen filters should
  // see, right there, that nutrition is the part CookLyt has no data for.
  {
    type: 'group', key: 'guestmenu', label: 'Guest Menu', Icon: QrCode, adminOnly: true,
    children: [
      { to: '/menu-card', label: 'Menu Card', Icon: QrCode },
      { to: '/menu-card/nutrition', label: 'Nutrition', Icon: Flame },
      // The reservation-first guest dine-in app (a separate surface on :3001).
      // External link — it is its own web app, not a dashboard route.
      { href: GUEST_APP_URL, label: 'Dine-in App', Icon: ExternalLink, external: true },
      ...(PLANNED_BY_GROUP['Guest Menu'] || []),
    ],
  },
  {
    type: 'group', key: 'operations', label: 'Operations', Icon: ShieldCheck, adminOnly: true,
    children: [
      { to: '/compliance', label: 'Compliance', Icon: ShieldCheck },
      { to: '/sops',       label: 'Playbook',   Icon: BookMarked },
    ],
  },
  { to: '/integrations/tally', label: 'Integrations', Icon: Plug, adminOnly: true },
  { to: '/users',    label: 'Users',    Icon: Users,    adminOnly: true },
  { to: '/settings', label: 'Settings', Icon: Settings, adminOnly: true },
  { to: '/feature-status', label: 'Feature Status', Icon: CircleDashed, adminOnly: true },
];

// Which paths belong to which collapsible group, so the group opens itself when
// you are on one of its pages.
//
// DERIVED from ALL_NAV rather than listed separately. It used to be a parallel
// hand-maintained map, which meant every group added since — Forecasting,
// Market Intel, Operations — and every new child (Economics,
// Menu Insights, Procurement) silently failed to auto-expand. A second list of
// the same thing only ever drifts.
const GROUP_PATHS = Object.fromEntries(
  ALL_NAV
    .filter((n) => n.type === 'group')
    // Only internal (routed) children have a `to`; external links (the dine-in
    // app) are excluded so they never drive group auto-expand or active state.
    .map((n) => [n.key, (n.children || []).filter((c) => c.to).map((c) => c.to)]),
);

const NOTIFIABLE = new Set(['NEW_ORDER', 'ORDER_READY', 'PAYMENT_COMPLETED', 'BILL_REQUESTED', 'STAFF_ASSIGNED', 'RESERVATION_REMINDER', 'ITEM_VOIDED', 'ITEM_WASTED']);

function MyQRModal({ user, onClose }) {
  const [qrUrl, setQrUrl] = useState('');

  useEffect(() => {
    if (!user?.staff_pin) return;
    QRCode.toDataURL(user.staff_pin, { width: 200, margin: 2 })
      .then(setQrUrl)
      .catch(() => {});
  }, [user?.staff_pin]);

  return (
    <Modal title={`My Staff QR${user?.name ? ` — ${user.name}` : ''}`} onClose={onClose}>
      {user?.staff_pin ? (
        <div className="flex flex-col items-center gap-4 py-2">
          <p style={{ fontSize: 12, color: 'var(--mute)', textAlign: 'center' }}>
            Customers scan this QR or enter your PIN when placing an order.
          </p>
          {qrUrl && (
            <img src={qrUrl} alt="Staff QR code" style={{ width: 200, height: 200, borderRadius: 8 }} />
          )}
          <p className="mono" style={{ fontSize: 28, fontWeight: 700, letterSpacing: '0.35em', color: 'var(--ink)' }}>
            {user.staff_pin}
          </p>
          {qrUrl && (
            <a
              href={qrUrl}
              download={`staff-qr-${user.email.split('@')[0]}.png`}
              className="btn-secondary"
              style={{ fontSize: 12 }}
            >
              Download QR
            </a>
          )}
        </div>
      ) : (
        <div className="py-6 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>
          No PIN assigned yet. Ask an admin to set your staff PIN.
        </div>
      )}
    </Modal>
  );
}

export default function Layout() {
  const { notifications, unreadCount, add, markAllRead, clearAll } = useNotifications();
  const [toasts, setToasts] = useState([]);

  function addToast(toast) {
    setToasts((prev) => {
      const isDuplicate = prev.some(
        (t) => t.event === toast.event && t.token === toast.token && Date.now() - t.ts < 2000,
      );
      if (isDuplicate) return prev;
      return [...prev, toast].slice(-5);
    });
  }

  function dismissToast(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  const [deliveryAlerts, setDeliveryAlerts] = useState([]);

  function addDeliveryAlert(order) {
    setDeliveryAlerts((prev) => {
      const isDuplicate = prev.some((a) => a.orderId === order.orderId);
      if (isDuplicate) return prev;
      return [...prev, order];
    });
  }

  function dismissDeliveryAlert(id) {
    setDeliveryAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  function acceptDeliveryAlert(alertId, orderId) {
    dismissDeliveryAlert(alertId);
    // Also clear the 10-second toast for this order so it doesn't linger
    setToasts((prev) => prev.filter((t) => t.orderId !== orderId));
  }
  const { user, restaurant, isAdmin, isCashier } = useAuth();
  const { data: aiStatus } = useAIStatus(user?.role === 'admin' || user?.role === 'staff');
  const { data: meProfile } = useMeProfile();
  const { data: settings } = useSettings();
  const updateSetting = useUpdateSetting();
  const isOpen = settings?.restaurant_open !== 'false';
  const setUserPresent = useSetUserPresent();
  const staffAssignmentEnabled = settings?.staff_assignment_enabled === 'true';

  // Device-local: when this terminal is the designated kitchen printer, auto-print
  // KOTs for customer/QR-placed orders (staff-placed orders still print manually).
  const [kotAutoPrint, setKotAutoPrint] = useState(() => localStorage.getItem('pos_kot_autoprint') === '1');
  const printedKotsRef = useRef(new Set()); // orderIds already auto-printed — guards duplicate NEW_ORDER events

  function toggleKotAutoPrint() {
    setKotAutoPrint((on) => {
      const next = !on;
      localStorage.setItem('pos_kot_autoprint', next ? '1' : '0');
      return next;
    });
  }

  useWebSocket({
    onEvent(event, payload) {
      if (!NOTIFIABLE.has(event)) return;
      // BILL_REQUESTED targeting is handled server-side — every client that receives
      // it is already the right recipient (assigned staff, admin, or cashier).
      if (event === 'BILL_REQUESTED' && user?.role === 'kitchen') return;
      let token   = null;
      let channel = null;
      if (event === 'BILL_REQUESTED') {
        token = payload?.tableNumber ? `Table ${payload.tableNumber}` : null;
        channel = null;
        // Store tableId so the notification can deep-link to the payment flow
        const meta = payload?.tableId ? { tableId: payload.tableId } : null;
        add(event, token, null, meta);
        addToast({ id: Date.now() + Math.random(), event, token, channel: null, orderId: null, ts: Date.now() });
        return;
      } else if (event === 'STAFF_ASSIGNED') {
        const parts = [];
        if (payload?.staffName) parts.push(payload.staffName);
        if (payload?.tableNumber) parts.push(`Table ${payload.tableNumber}`);
        token = parts.length ? parts.join(' → ') : null;
      } else if (event === 'RESERVATION_REMINDER') {
        token = payload?.guestName
          ? `${payload.guestName}${payload.tableNumber != null ? ` · T${payload.tableNumber}` : ''}`
          : null;
      } else if (event === 'NEW_ORDER') {
        channel = payload?.channel ?? 'dining';
        const orderId = payload?.orderId ? `#${payload.orderId.slice(-6).toUpperCase()}` : null;
        const prefix  = channel === 'delivery' ? 'Delivery' : channel === 'takeaway' ? 'Takeaway' : null;
        token = prefix && orderId ? `${prefix} · ${orderId}` : orderId;
      } else if (event === 'ITEM_VOIDED' || event === 'ITEM_WASTED') {
        const name = payload?.menuItemName ?? 'Item';
        const qty  = payload?.quantity    ?? '';
        token = qty ? `${name} ×${qty}` : name;
      } else {
        token = payload?.orderId ? `#${payload.orderId.slice(-6).toUpperCase()}` : null;
      }
      const orderId = payload?.orderId ?? null;
      add(event, token, channel);
      addToast({ id: Date.now() + Math.random(), event, token, channel, orderId, ts: Date.now() });
      if (event === 'NEW_ORDER' && channel === 'delivery') {
        addDeliveryAlert({ id: Date.now() + Math.random(), orderId });
      }
      // Auto-print KOT for customer/QR-placed orders when this is the designated
      // kitchen-printer terminal. Dedup so a duplicate NEW_ORDER never double-prints.
      if (event === 'NEW_ORDER' && kotAutoPrint && payload?.customerPlaced && orderId
          && !printedKotsRef.current.has(orderId)) {
        printedKotsRef.current.add(orderId);
        api.get(`/orders/${orderId}/kot`)
          .then(({ data }) => { if (data) printKOTSilent(data); })
          .catch(() => { printedKotsRef.current.delete(orderId); }); // allow retry on next event
      }
    },
  });

  const navigate  = useNavigate();
  const location  = useLocation();
  const [sidebarOpen,      setSidebarOpen]      = useState(false);
  const [showChangePwd,   setShowChangePwd]   = useState(false);
  const [showMyQR,        setShowMyQR]        = useState(false);
  const [showNewOrder,    setShowNewOrder]    = useState(false);
  const [isFullscreen,    setIsFullscreen]    = useState(!!document.fullscreenElement);
  const [confirmOpen,     setConfirmOpen]     = useState(false);

  useEffect(() => {
    function onFsChange() { setIsFullscreen(!!document.fullscreenElement); }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Apply restaurant brand theme as CSS variable overrides
  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    const {
      theme_primary, theme_accent_on,
      theme_page_bg, theme_paper_2, theme_paper_3,
      theme_sidebar_bg,
      theme_ink, theme_ink_2, theme_mute, theme_mute_2,
      theme_line, theme_line_2,
      theme_ok, theme_warn, theme_bad, theme_info,
    } = settings;

    // Brand
    if (theme_primary) {
      root.style.setProperty('--accent',    theme_primary);
      root.style.setProperty('--accent-on', theme_accent_on || contrastColor(theme_primary));
    } else {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-on');
    }

    // Surfaces
    if (theme_page_bg) {
      root.style.setProperty('--paper',   theme_page_bg);
      root.style.setProperty('--paper-2', theme_paper_2 || darkenHex(theme_page_bg, -0.035));
    } else {
      root.style.removeProperty('--paper');
      if (theme_paper_2) root.style.setProperty('--paper-2', theme_paper_2);
      else               root.style.removeProperty('--paper-2');
    }
    if (theme_paper_3) root.style.setProperty('--paper-3', theme_paper_3);
    else               root.style.removeProperty('--paper-3');

    // Sidebar
    root.style.setProperty('--brand-sidebar', theme_sidebar_bg || theme_page_bg || '');

    // Text
    const setOrRemove = (prop, val) => val
      ? root.style.setProperty(prop, val)
      : root.style.removeProperty(prop);
    setOrRemove('--ink',    theme_ink);
    setOrRemove('--ink-2',  theme_ink_2);
    setOrRemove('--mute',   theme_mute);
    setOrRemove('--mute-2', theme_mute_2);

    // Borders
    setOrRemove('--line',   theme_line);
    setOrRemove('--line-2', theme_line_2);

    // Status
    setOrRemove('--ok',   theme_ok);
    setOrRemove('--warn', theme_warn);
    setOrRemove('--bad',  theme_bad);
    setOrRemove('--info', theme_info);

    return () => {
      for (const prop of [
        '--accent', '--accent-on',
        '--paper', '--paper-2', '--paper-3',
        '--brand-sidebar',
        '--ink', '--ink-2', '--mute', '--mute-2',
        '--line', '--line-2',
        '--ok', '--warn', '--bad', '--info',
      ]) root.style.removeProperty(prop);
    };
  }, [settings]);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }
  const [openGroups, setOpenGroups] = useState(() =>
    Object.fromEntries(
      Object.entries(GROUP_PATHS).map(([key, paths]) => [
        key, paths.some(p => location.pathname.startsWith(p)),
      ])
    )
  );

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const active = Object.fromEntries(
      Object.entries(GROUP_PATHS)
        .filter(([, paths]) => paths.some(p => location.pathname.startsWith(p)))
        .map(([key]) => [key, true])
    );
    if (Object.keys(active).length) setOpenGroups(prev => ({ ...prev, ...active }));
  }, [location.pathname]);

  const isKitchen = user?.role === 'kitchen';
  // Drop the AI Assistant nav item when the operator disabled it for this restaurant
  const aiDisabled = aiStatus?.enabled === false;
  const nav = ALL_NAV.filter(
    (n) => (!n.adminOnly || isAdmin) && (!n.staffOnly || !isKitchen) && !(n.to === '/ai-chat' && aiDisabled),
  );

  // Path match on a segment boundary, not a bare prefix. A plain startsWith
  // makes '/menu-insights' match the '/menu' nav item — which sits earlier in
  // ALL_NAV — so the tab read "Menu" on the Menu Insights page. Sibling routes
  // that merely share an opening string are different pages; only a real child
  // path ('/waste-log/waste-insights' under '/waste-log') should match.
  const matchesPath = (to, end) =>
    end
      ? location.pathname === to
      : location.pathname === to || location.pathname.startsWith(`${to}/`);

  const pageLabel = (() => {
    for (const n of nav) {
      if (n.type === 'group') {
        const child = n.children.find((c) => matchesPath(c.to));
        if (child) return child.label;
      } else if (matchesPath(n.to, n.end)) {
        return n.label;
      }
    }
    return '';
  })();

  useEffect(() => {
    document.title = pageLabel ? `${pageLabel} — Cooklyt` : 'Cooklyt';
  }, [pageLabel]);

  async function logout() {
    try { await api.post('/auth/logout'); } catch {}
    localStorage.removeItem('pos_user');
    localStorage.removeItem('pos_restaurant');
    navigate('/login');
  }

  const initials = (user?.email ?? 'CK').slice(0, 2).toUpperCase();

  return (
    <div className="flex h-screen" style={{ background: 'var(--paper)' }}>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-56 shrink-0 flex-col
          transition-transform duration-200 ease-in-out
          lg:relative lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: 'var(--brand-sidebar, var(--paper))', borderRight: '1px solid var(--line)' }}
      >
        {/* Brand */}
        <div
          className="flex h-12 items-center gap-2.5 px-4 shrink-0"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          {settings?.theme_logo_url ? (
            <div style={{
              width: 26, height: 26, borderRadius: 4, flexShrink: 0,
              background: settings.theme_logo_bg || 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
              <img
                src={settings.theme_logo_url}
                alt="Restaurant logo"
                referrerPolicy="no-referrer"
                style={{ maxWidth: 22, maxHeight: 22, objectFit: 'contain' }}
              />
            </div>
          ) : (
            <svg width="20" height="20" viewBox="0 0 200 200" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M 154.194 25.409 A 92.2 92.2 0 1 0 154.194 174.591"
                    fill="none" stroke="#0d0c0b" strokeWidth="15.6" strokeLinecap="round"/>
              <circle cx="100" cy="100" r="10.8" fill="#b06a3b"/>
            </svg>
          )}
          <span className="truncate text-[12px] font-semibold" style={{ color: 'var(--ink)', letterSpacing: '-0.005em' }}>
            {restaurant?.name || 'Cooklyt'}
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto rounded-md p-1 lg:hidden"
            style={{ color: 'var(--mute)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-px px-2 py-3 overflow-y-auto">
          {nav.map((item) => {
            if (item.type === 'group') {
              const GroupIcon = item.Icon;
              const isOpen = openGroups[item.key] ?? false;
              const groupActive = item.children.some(c => c.to && location.pathname.startsWith(c.to));
              return (
                <div key={item.key} className="shrink-0">
                  <button
                    onClick={() => setOpenGroups(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                    className="flex w-full items-center gap-2.5 rounded-[6px] px-2.5 text-[12.5px] font-medium transition-colors duration-75"
                    style={{ height: 36, background: groupActive ? 'var(--paper-2)' : 'transparent', color: groupActive ? 'var(--ink)' : 'var(--mute)' }}
                    onMouseEnter={(e) => { if (!groupActive) { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)'; } }}
                    onMouseLeave={(e) => { if (!groupActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; } }}
                  >
                    <GroupIcon size={16} />
                    {item.label}
                    <ChevronDown
                      size={12}
                      className="ml-auto shrink-0"
                      style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }}
                    />
                  </button>
                  {isOpen && (
                    <div
                      className="mt-px flex flex-col gap-px pb-px"
                      style={{ borderLeft: '1px solid var(--line)', marginLeft: 14, paddingLeft: 6 }}
                    >
                      {item.children.map(({ to, href, label, Icon }) => {
                        const childClass =
                          'flex items-center gap-2 rounded-[6px] px-2.5 text-[12px] font-medium transition-colors duration-75 nav-default';
                        const hoverIn = (e) => {
                          if (!e.currentTarget.classList.contains('nav-active')) {
                            e.currentTarget.style.background = 'var(--hover)';
                            e.currentTarget.style.color = 'var(--ink)';
                          }
                        };
                        // External surfaces (the dine-in app) open in a new tab —
                        // a plain anchor, never a router link, and never "active".
                        if (href) {
                          return (
                            <a
                              key={href}
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={childClass}
                              style={{ height: 32, background: 'transparent', color: 'var(--mute)' }}
                              onMouseEnter={hoverIn}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'var(--mute)';
                              }}
                            >
                              <Icon size={13} />
                              {label}
                            </a>
                          );
                        }
                        return (
                          <NavLink
                            key={to}
                            to={to}
                            className={({ isActive }) =>
                              `flex items-center gap-2 rounded-[6px] px-2.5 text-[12px] font-medium transition-colors duration-75 ${
                                isActive ? 'nav-active' : 'nav-default'
                              }`
                            }
                            style={({ isActive }) => ({
                              height: 32,
                              background: isActive ? 'var(--paper-2)' : 'transparent',
                              color: isActive ? 'var(--ink)' : 'var(--mute)',
                            })}
                            onMouseEnter={hoverIn}
                            onMouseLeave={(e) => {
                              if (!location.pathname.startsWith(to)) {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'var(--mute)';
                              }
                            }}
                          >
                            <Icon size={13} />
                            {label}
                          </NavLink>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const { to, label, Icon, end } = item;
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  // shrink-0: the nav is an overflowing flex column, so without
                  // this a flat row is squashed below its 36px while the group
                  // rows (buttons in a wrapper div) keep theirs — the source of
                  // the uneven spacing. Rows hold height; the nav scrolls.
                  `shrink-0 flex items-center gap-2.5 rounded-[6px] px-2.5 text-[12.5px] font-medium transition-colors duration-75 ${
                    isActive ? 'nav-active' : 'nav-default'
                  }`
                }
                style={({ isActive }) => ({
                  height: 36,
                  background: isActive ? 'var(--paper-2)' : 'transparent',
                  color: isActive ? 'var(--ink)' : 'var(--mute)',
                })}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.classList.contains('nav-active')) {
                    e.currentTarget.style.background = 'var(--hover)';
                    e.currentTarget.style.color = 'var(--ink)';
                  }
                }}
                onMouseLeave={(e) => {
                  const active = location.pathname.startsWith(to) || (end && location.pathname === to);
                  if (!active) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--mute)';
                  }
                }}
              >
                <Icon size={16} />
                {label}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="shrink-0 px-2 pb-3 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
          {!isAdmin && staffAssignmentEnabled && (
            <button
              onClick={() => setShowMyQR(true)}
              className="flex w-full items-center gap-2.5 rounded-[6px] px-2.5 text-[12px] transition-colors duration-75"
              style={{ height: 36, color: 'var(--mute)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; }}
            >
              <QrCode size={15} />
              My QR
              {meProfile?.staff_pin && (
                <span
                  className="ml-auto mono"
                  style={{ fontSize: 10, letterSpacing: '0.15em', color: 'var(--ok)', fontWeight: 600 }}
                >
                  {meProfile.staff_pin}
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => {
              if (meProfile?.id) {
                setUserPresent.mutate({ id: meProfile.id, isPresent: !meProfile.is_present });
              }
            }}
            className="flex w-full items-center gap-2.5 rounded-[6px] px-2.5 text-[12px] transition-colors duration-75"
            style={{ height: 36, color: meProfile?.is_present ? 'var(--ok)' : 'var(--mute)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = meProfile?.is_present ? 'var(--ok)' : 'var(--mute)'; }}
          >
            <MapPin size={15} />
            {meProfile?.is_present ? 'Present' : 'Mark as Present'}
          </button>
          <button
            onClick={() => setShowChangePwd(true)}
            className="flex w-full items-center gap-2.5 rounded-[6px] px-2.5 text-[12px] transition-colors duration-75"
            style={{ height: 36, color: 'var(--mute)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; }}
          >
            <KeyRound size={15} />
            Change Password
          </button>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-[6px] px-2.5 text-[12px] transition-colors duration-75"
            style={{ height: 36, color: 'var(--mute)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; }}
          >
            <LogOut size={15} />
            Sign out
          </button>

          <div className="mt-2 flex items-center gap-2 px-2.5">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold"
              style={{ background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink)' }}
            >
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[11.5px] font-medium" style={{ color: 'var(--ink)' }}>
                {user?.name || user?.email}
              </p>
              <p className="truncate text-[10.5px]" style={{ color: 'var(--mute)' }}>
                {user?.name ? user.email : <span className="capitalize">{user?.role}</span>}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <OfflineBanner />

        {/* Closed banner — visible to all staff */}
        {!isOpen && (
          <div className="flex shrink-0 items-center justify-center gap-2 px-4 py-2" style={{ background: 'var(--bad)', color: '#fff' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Restaurant is closed — new orders are paused</span>
          </div>
        )}

        {/* Topbar */}
        <header
          className="flex h-12 shrink-0 items-center gap-3 px-5"
          style={{ borderBottom: '1px solid var(--line)', background: 'var(--paper)' }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 lg:hidden"
            style={{ color: 'var(--mute)' }}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
            {pageLabel}
          </span>
          {restaurant?.name && (
            <span className="hidden text-[12px] sm:block" style={{ color: 'var(--mute)' }}>
              · {restaurant.name}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <SyncBadge />
            {isAdmin && (
              <button
                onClick={() => setConfirmOpen(true)}
                title={isOpen ? 'Close restaurant' : 'Open restaurant'}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  height: 26, padding: '0 10px', borderRadius: 999,
                  border: `1.5px solid ${isOpen ? 'var(--ok)' : 'var(--bad)'}`,
                  background: isOpen ? 'rgba(31,138,91,.08)' : 'rgba(179,55,43,.08)',
                  color: isOpen ? 'var(--ok)' : 'var(--bad)',
                  fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                  transition: 'background .1s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = isOpen ? 'rgba(31,138,91,.16)' : 'rgba(179,55,43,.16)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = isOpen ? 'rgba(31,138,91,.08)' : 'rgba(179,55,43,.08)')}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: isOpen ? 'var(--ok)' : 'var(--bad)', display: 'inline-block', flexShrink: 0 }} />
                <span className="hidden sm:inline">{isOpen ? 'Open' : 'Closed'}</span>
              </button>
            )}
            {!isKitchen && (
              <button
                onClick={() => setShowNewOrder(true)}
                className="btn-primary btn-sm"
                style={{ gap: 5 }}
              >
                <Plus size={13} />
                <span className="hidden sm:inline">New Order</span>
              </button>
            )}
            <button
              onClick={toggleKotAutoPrint}
              title={kotAutoPrint
                ? 'Auto-print KOT is ON for this terminal — new QR/customer orders print automatically. Click to turn off.'
                : 'Auto-print KOT is OFF. Turn on to make this terminal print KOTs for new QR/customer orders.'}
              aria-pressed={kotAutoPrint}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: 6, border: 0, cursor: 'pointer',
                background: kotAutoPrint ? 'rgba(31,138,91,.12)' : 'transparent',
                color: kotAutoPrint ? 'var(--ok)' : 'var(--mute)',
                transition: 'background .08s, color .08s',
              }}
              onMouseEnter={(e) => { if (!kotAutoPrint) { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)'; } }}
              onMouseLeave={(e) => { if (!kotAutoPrint) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; } }}
            >
              <Printer size={15} />
            </button>
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: 6, border: 0, cursor: 'pointer',
                background: 'transparent', color: 'var(--mute)',
                transition: 'background .08s, color .08s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; }}
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <NotificationBell
              notifications={notifications}
              unreadCount={unreadCount}
              onOpen={() => { markAllRead(); setToasts([]); }}
              onClear={clearAll}
            />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-5 lg:p-6">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {showChangePwd && (
        <ChangePasswordModal onClose={() => setShowChangePwd(false)} />
      )}
      {showMyQR && (
        <MyQRModal user={meProfile} onClose={() => setShowMyQR(false)} />
      )}
      {showNewOrder && (
        <NewOrderModal onClose={() => setShowNewOrder(false)} />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <DeliveryAlertContainer alerts={deliveryAlerts} onDismiss={dismissDeliveryAlert} onAccept={acceptDeliveryAlert} />
      <ChatBubble />

      {/* Restaurant open/close confirmation */}
      {confirmOpen && createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(10,10,10,.5)' }}
        >
          <div style={{
            background: 'var(--paper)', border: '1px solid var(--line-2)',
            borderRadius: 10, padding: 24, maxWidth: 380, width: '100%',
          }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>
              {isOpen ? 'Close the restaurant?' : 'Open the restaurant?'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 20, lineHeight: 1.55 }}>
              {isOpen
                ? 'Staff will not be able to place new orders until the restaurant is reopened. Existing orders and payments are unaffected.'
                : 'The restaurant will accept new orders again immediately.'}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmOpen(false)} className="btn-secondary flex-1 justify-center">
                Cancel
              </button>
              <button
                onClick={async () => {
                  await updateSetting.mutateAsync({ key: 'restaurant_open', value: isOpen ? 'false' : 'true' });
                  setConfirmOpen(false);
                }}
                disabled={updateSetting.isPending}
                className="flex-1 justify-center rounded-[6px] px-4 py-2 text-[13px] font-medium text-white border-0 cursor-pointer disabled:opacity-60"
                style={{ background: isOpen ? 'var(--bad)' : 'var(--ok)' }}
              >
                {updateSetting.isPending
                  ? (isOpen ? 'Closing…' : 'Opening…')
                  : (isOpen ? 'Yes, close restaurant' : 'Yes, open restaurant')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
