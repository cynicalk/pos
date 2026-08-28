import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { useSync } from './hooks/useSync';
import { useSettings } from './hooks/useSettings';
import { useTimezone } from './context/TimezoneContext';
import { useCurrency } from './context/CurrencyContext';
import { AIProvider } from './context/AIContext';
import { setNavigate } from './lib/navigate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PLANNED_FEATURES } from './lib/plannedFeatures';

// Marketing pages are lazy-loaded too — only "/" (Landing) ships in the
// initial bundle for first-time visitors.
const Landing  = lazy(() => import('./pages/Landing'));
const Problem  = lazy(() => import('./pages/Problem'));
const Waste    = lazy(() => import('./pages/Waste'));
const Features = lazy(() => import('./pages/Features'));
const Compare  = lazy(() => import('./pages/Compare'));
const Mission  = lazy(() => import('./pages/Mission'));
const Access   = lazy(() => import('./pages/Access'));

// Everything behind auth is code-split so visitors landing on "/" only download the landing page
const Layout          = lazy(() => import('./components/Layout'));
const Login           = lazy(() => import('./pages/Login'));
const ChangePassword  = lazy(() => import('./pages/ChangePassword'));
const VerifyEmail     = lazy(() => import('./pages/VerifyEmail'));
const ForgotPassword  = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword   = lazy(() => import('./pages/ResetPassword'));
const SetPassword     = lazy(() => import('./pages/SetPassword'));
const OAuthCallback   = lazy(() => import('./pages/OAuthCallback'));
const Overview        = lazy(() => import('./pages/Overview'));
const Menu            = lazy(() => import('./pages/Menu'));
const Tables          = lazy(() => import('./pages/Tables'));
const Orders          = lazy(() => import('./pages/Orders'));
const Reports         = lazy(() => import('./pages/Reports'));
const Users           = lazy(() => import('./pages/Users'));
const Settings        = lazy(() => import('./pages/Settings'));
const OrderHistory    = lazy(() => import('./pages/OrderHistory'));
const ShiftCount      = lazy(() => import('./pages/ShiftCount'));
const ShiftHistory    = lazy(() => import('./pages/ShiftHistory'));
const Ingredients     = lazy(() => import('./pages/Ingredients'));
const Recipes         = lazy(() => import('./pages/Recipes'));
const Combos          = lazy(() => import('./pages/Combos'));
const WasteLog        = lazy(() => import('./pages/WasteLog'));
const CostingReports  = lazy(() => import('./pages/CostingReports'));
const InventoryLedger = lazy(() => import('./pages/InventoryLedger'));
const Stocktake       = lazy(() => import('./pages/Stocktake'));
const FoodCostVariance = lazy(() => import('./pages/FoodCostVariance'));
const Reservations    = lazy(() => import('./pages/Reservations'));
const Waitlist        = lazy(() => import('./pages/Waitlist'));
const Coupons         = lazy(() => import('./pages/Coupons'));
const Loyalty         = lazy(() => import('./pages/Loyalty'));
const Reviews         = lazy(() => import('./pages/Reviews'));
const AIChat          = lazy(() => import('./pages/AIChat'));
const PlannedFeature  = lazy(() => import('./pages/PlannedFeature'));
const DemandForecast  = lazy(() => import('./pages/DemandForecast'));
const PrepSheet       = lazy(() => import('./pages/PrepSheet'));
const InventoryForecast = lazy(() => import('./pages/InventoryForecast'));
const ReorderPlan     = lazy(() => import('./pages/ReorderPlan'));
const ShiftPlan       = lazy(() => import('./pages/ShiftPlan'));
const Scheduling      = lazy(() => import('./pages/Scheduling'));
const FeatureStatus   = lazy(() => import('./pages/FeatureStatus'));
const Actions         = lazy(() => import('./pages/Actions'));
const Economics       = lazy(() => import('./pages/Economics'));
const MenuInsights    = lazy(() => import('./pages/MenuInsights'));
const Procurement     = lazy(() => import('./pages/Procurement'));
const Compliance      = lazy(() => import('./pages/Compliance'));
const Sops            = lazy(() => import('./pages/Sops'));
const Rankings        = lazy(() => import('./pages/Rankings'));
const Guests          = lazy(() => import('./pages/Guests'));
const Group           = lazy(() => import('./pages/Group'));
const MenuCard        = lazy(() => import('./pages/MenuCard'));
const NutritionCard   = lazy(() => import('./pages/NutritionCard'));
const Payouts         = lazy(() => import('./pages/Payouts'));
const AccountingExport = lazy(() => import('./pages/AccountingExport'));

function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('pos_user') || 'null'); } catch { return null; }
}

function RequireAuth({ children }) {
  return getStoredUser() ? children : <Navigate to="/login" replace />;
}

function RequireGuest({ children }) {
  return getStoredUser() ? <Navigate to="/overview" replace /> : children;
}

function RequireAdmin({ children }) {
  const user = getStoredUser();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/overview" replace />;
  return children;
}

function RequireNotKitchen({ children }) {
  const user = getStoredUser();
  if (user?.role === 'kitchen') return <Navigate to="/orders" replace />;
  return children;
}

function RequirePasswordSet({ children }) {
  const user = getStoredUser();
  if (user?.forcePasswordChange) return <Navigate to="/change-password" replace />;
  return children;
}

function SyncWatcher() {
  useSync();
  return null;
}

function NavigateSync() {
  const nav = useNavigate();
  useEffect(() => setNavigate(nav), [nav]);
  return null;
}

function SettingsSync() {
  const { data: settings } = useSettings();
  const { iana, setTimezone } = useTimezone();
  const { code, setCurrency } = useCurrency();

  useEffect(() => {
    if (!settings) return;
    if (settings.timezone && settings.timezone !== iana) setTimezone(settings.timezone);
    if (settings.currency && settings.currency !== code) setCurrency(settings.currency);
  }, [settings, iana, code, setTimezone, setCurrency]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SyncWatcher />
      <NavigateSync />
      <ErrorBoundary>
        <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--paper)' }} />}>
          <Routes>
          {/* ── Public marketing pages ── */}
          <Route path="/"          element={<Landing />} />
          <Route path="/problem"   element={<Problem />} />
          <Route path="/waste"     element={<Waste />} />
          <Route path="/features"  element={<Features />} />
          <Route path="/compare"   element={<Compare />} />
          <Route path="/mission"   element={<Mission />} />
          <Route path="/access"    element={<Access />} />

          {/* ── Auth pages ── */}
          <Route path="/login"           element={<RequireGuest><Login /></RequireGuest>} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/verify-email"    element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<RequireGuest><ForgotPassword /></RequireGuest>} />
          <Route path="/reset-password"  element={<RequireGuest><ResetPassword /></RequireGuest>} />
          <Route path="/set-password"    element={<SetPassword />} />
          <Route path="/oauth/callback"  element={<OAuthCallback />} />

          {/* ── Authenticated POS app ── */}
          <Route
            element={
              <RequireAuth>
                <RequirePasswordSet>
                  <SettingsSync />
                  <AIProvider>
                    <Layout />
                  </AIProvider>
                </RequirePasswordSet>
              </RequireAuth>
            }
          >
            <Route path="/overview" element={<Overview />} />
            <Route path="/menu"     element={<Menu />} />
            <Route path="/tables"              element={<Tables />} />
            <Route path="/tables/reservations" element={<RequireAdmin><Reservations /></RequireAdmin>} />
            <Route path="/tables/waitlist"     element={<RequireNotKitchen><Waitlist /></RequireNotKitchen>} />
            <Route path="/orders"   element={<Orders />} />
            <Route path="/reports"  element={<RequireAdmin><Reports /></RequireAdmin>} />
            <Route path="/users"    element={<RequireAdmin><Users /></RequireAdmin>} />
            <Route path="/settings" element={<RequireAdmin><Settings /></RequireAdmin>} />
            <Route path="/history"  element={<RequireNotKitchen><OrderHistory /></RequireNotKitchen>} />
            <Route path="/shift"         element={<RequireNotKitchen><ShiftCount /></RequireNotKitchen>} />
            <Route path="/shift/history" element={<RequireAdmin><ShiftHistory /></RequireAdmin>} />
            <Route path="/ingredients" element={<RequireAdmin><Ingredients /></RequireAdmin>} />
            <Route path="/inventory"   element={<RequireAdmin><InventoryLedger /></RequireAdmin>} />
            <Route path="/recipes"     element={<RequireAdmin><Recipes /></RequireAdmin>} />
            <Route path="/combos"      element={<RequireAdmin><Combos /></RequireAdmin>} />
            <Route path="/waste-log"   element={<RequireAdmin><WasteLog /></RequireAdmin>} />
            <Route path="/waste-log/waste-insights" element={<RequireAdmin><WasteLog /></RequireAdmin>} />
            <Route path="/costing"     element={<RequireAdmin><CostingReports /></RequireAdmin>} />
            <Route path="/variance"    element={<RequireAdmin><FoodCostVariance /></RequireAdmin>} />
            <Route path="/stocktake"   element={<RequireAdmin><Stocktake /></RequireAdmin>} />
            <Route path="/coupons"     element={<RequireAdmin><Coupons /></RequireAdmin>} />
            <Route path="/loyalty"     element={<RequireAdmin><Loyalty /></RequireAdmin>} />
            <Route path="/reviews"     element={<RequireAdmin><Reviews /></RequireAdmin>} />
            <Route path="/ai-chat"     element={<RequireNotKitchen><AIChat /></RequireNotKitchen>} />
            <Route path="/actions"     element={<RequireAdmin><Actions /></RequireAdmin>} />
            <Route path="/economics"     element={<RequireAdmin><Economics /></RequireAdmin>} />
            <Route path="/menu-insights" element={<RequireAdmin><MenuInsights /></RequireAdmin>} />
            <Route path="/procurement"   element={<RequireAdmin><Procurement /></RequireAdmin>} />
            <Route path="/compliance"    element={<RequireAdmin><Compliance /></RequireAdmin>} />
            <Route path="/sops"          element={<RequireNotKitchen><Sops /></RequireNotKitchen>} />
            <Route path="/rankings"      element={<RequireAdmin><Rankings /></RequireAdmin>} />
            <Route path="/guests"        element={<RequireAdmin><Guests /></RequireAdmin>} />
            <Route path="/group"         element={<RequireAdmin><Group /></RequireAdmin>} />
            <Route path="/menu-card"     element={<RequireAdmin><MenuCard /></RequireAdmin>} />
            <Route path="/menu-card/nutrition" element={<RequireAdmin><NutritionCard /></RequireAdmin>} />
            <Route path="/payouts"       element={<RequireAdmin><Payouts /></RequireAdmin>} />
            <Route path="/accounting"    element={<RequireAdmin><AccountingExport /></RequireAdmin>} />

            {/* Tier 0 forecasting — shells becoming real pages as the engine
                reaches them. Their paths do not move: settling the URLs early was
                the whole point of giving the shells their final routes. */}
            <Route path="/forecast/demand"     element={<RequireAdmin><DemandForecast /></RequireAdmin>} />
            <Route path="/forecast/prep-sheet" element={<RequireAdmin><PrepSheet /></RequireAdmin>} />
            <Route path="/forecast/inventory"  element={<RequireAdmin><InventoryForecast /></RequireAdmin>} />
            <Route path="/forecast/reorder"    element={<RequireAdmin><ReorderPlan /></RequireAdmin>} />
            <Route path="/forecast/shift-planning" element={<RequireAdmin><ShiftPlan /></RequireAdmin>} />
            <Route path="/forecast/scheduling"     element={<RequireAdmin><Scheduling /></RequireAdmin>} />

            {/* Internal source of truth for what the app actually does (W1). */}
            <Route path="/feature-status"      element={<RequireAdmin><FeatureStatus /></RequireAdmin>} />

            {/* The 18 not-yet-possible features (MERGE_PLAN.md §2 Tier 3). Their
                final URLs are claimed now so that shipping one swaps the element
                without moving the route. */}
            {PLANNED_FEATURES.map((f) => (
              <Route
                key={f.slug}
                path={f.path}
                element={<RequireAdmin><PlannedFeature slug={f.slug} /></RequireAdmin>}
              />
            ))}
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
