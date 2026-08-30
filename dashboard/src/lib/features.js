/**
 * Feature toggles — per-restaurant on/off switches for the operator's own app.
 *
 * An admin can hide modules they don't use (say, Market Intel or Forecasting) so
 * the nav and the pages behind them disappear for their whole team. The state is
 * one JSON object stored under the `feature_flags` setting: a key maps to `false`
 * only when it is switched OFF, so the default — and anything not listed — is ON.
 * That keeps the stored value small and makes "enable everything" the empty map.
 *
 * The keys are the nav paths themselves (a group is `group:<key>`), so this list
 * cannot drift from the menu the operator actually sees — it is derived from the
 * same ALL_NAV the sidebar renders, never a second copy of it.
 *
 * These are pure helpers with no imports, so both the sidebar (which filters the
 * nav) and the toggles page (which writes the flags) share one definition of what
 * "enabled" means and which features may never be switched off.
 */

// Features that must always stay on: the core POS flow, and the admin screens an
// operator would need to switch anything back on. Disabling these would be a
// foot-gun (a POS that can't take orders) or a lock-out (no way back to this
// page), so the UI never offers a switch for them and the filter forces them on.
export const PROTECTED_KEYS = new Set([
  '/overview',
  '/menu',
  '/tables',
  '/orders',
  '/shift',
  '/ai-chat',        // has its own switch in Settings — not duplicated here
  '/users',
  '/settings',
  '/feature-status',
  '/feature-toggles',
]);

/** The flag key for a nav entry: its path, or `group:<key>` for a group header. */
export function navKey(item) {
  return item.type === 'group' ? `group:${item.key}` : item.to;
}

/** Parse the stored flag map; a missing or malformed value means "all on". */
export function parseFlags(settings) {
  const raw = settings?.feature_flags;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** A feature is on unless explicitly switched off — and protected ones always on. */
export function isFeatureEnabled(key, flags) {
  if (!key) return true;
  if (PROTECTED_KEYS.has(key)) return true;
  return flags?.[key] !== false;
}

/** Path match on a segment boundary, so '/menu' does not swallow '/menu-insights'. */
function matchesPath(pathname, to) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

/**
 * The disabled feature that owns the current route, or null when the route is
 * allowed. Used to gate the page body: a bookmarked or typed URL to a switched-off
 * module lands on an honest "turned off" panel instead of the working screen.
 * Only routes that map to a real nav feature are gated — deep/detail pages that
 * aren't in the nav are never blocked.
 */
export function blockedFeatureForPath(pathname, nav, flags) {
  for (const n of nav) {
    if (n.type === 'group') {
      const childHit = (n.children || []).find((c) => c.to && matchesPath(pathname, c.to));
      if (!childHit) continue;
      if (!isFeatureEnabled(`group:${n.key}`, flags)) return { label: n.label, groupLabel: n.label };
      if (!isFeatureEnabled(childHit.to, flags)) return { label: childHit.label, groupLabel: n.label };
      return null;
    }
    if (n.to && matchesPath(pathname, n.to)) {
      return isFeatureEnabled(n.to, flags) ? null : { label: n.label, groupLabel: null };
    }
  }
  return null;
}

/**
 * Flatten ALL_NAV into the toggleable feature rows the toggles page renders:
 * one section per group (and one "Core" section for top-level items), each row
 * carrying its key, label, and whether it is protected. External links (the
 * dine-in app) and pure section headers carry no route and are skipped.
 */
export function collectFeatureSections(nav) {
  const sections = [];
  const core = { label: 'General', groupKey: null, items: [] };

  for (const n of nav) {
    if (n.type === 'group') {
      const items = (n.children || [])
        .filter((c) => c.to && !c.external)
        .map((c) => ({ key: c.to, label: c.label, protected: PROTECTED_KEYS.has(c.to) }));
      if (items.length) {
        sections.push({ label: n.label, groupKey: `group:${n.key}`, items });
      }
    } else if (n.to) {
      core.items.push({ key: n.to, label: n.label, protected: PROTECTED_KEYS.has(n.to) });
    }
  }

  return core.items.length ? [core, ...sections] : sections;
}
