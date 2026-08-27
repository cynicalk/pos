import type { CartItem, Dish, GroupType, Member } from "@/types";

/** The shared-table sync document. The guest app owns this shape; the
 *  backend stores it verbatim and mirrors members for ops analytics. */
export interface SharedTableDoc {
  cart: CartItem[];
  members: Member[];
  groupType: GroupType | null;
  partySize: number | null;
  rev: number;
}

/**
 * Bridge to the Cooklyt operator backend (the ops app on its own port).
 * Every call degrades gracefully: if the backend is down, the guest app
 * behaves exactly as the standalone prototype did — recommendations fall
 * back to seeded co-order rules and orders get a local number.
 */

const API_BASE = process.env.NEXT_PUBLIC_COOKLYT_API ?? "http://localhost:3000";

/**
 * Which outlet this guest surface belongs to. Set NEXT_PUBLIC_COOKLYT_OUTLET
 * (e.g. baked into the QR code's deployment) so orders and tables land on the
 * right restaurant. When unset the backend falls back to its default outlet,
 * which is only correct for a single-outlet deployment.
 */
const OUTLET_ID = process.env.NEXT_PUBLIC_COOKLYT_OUTLET ?? "";

/** Appends the outlet query param when one is configured. */
function withOutlet(path: string): string {
  if (!OUTLET_ID) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}outlet=${encodeURIComponent(OUTLET_ID)}`;
}

const FETCH_TIMEOUT_MS = 8000;

function withTimeout(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/** A mined item-affinity pair: baskets with `a` tend to contain `b`. */
export interface MinedAffinity {
  a: string;
  b: string;
  lift: number;
}

export async function fetchMinedAffinities(): Promise<MinedAffinity[]> {
  try {
    const res = await fetch(
      `${API_BASE}${withOutlet("/api/guest/affinities")}`,
      {
        signal: withTimeout(FETCH_TIMEOUT_MS),
      },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { pairs?: MinedAffinity[] };
    return Array.isArray(json.pairs) ? json.pairs : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Shared table (Joined Cart)                                          */
/* ------------------------------------------------------------------ */

export async function openTable(
  shared: SharedTableDoc,
  phone?: string,
): Promise<{ visitId: string; code: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/guest/table`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: withTimeout(FETCH_TIMEOUT_MS),
      body: JSON.stringify({ shared, phone, outletId: OUTLET_ID || undefined }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      success?: boolean;
      visitId?: string;
      code?: string;
    };
    if (!json.success || !json.visitId || !json.code) return null;
    return { visitId: json.visitId, code: json.code };
  } catch {
    return null;
  }
}

export async function fetchTable(code: string): Promise<{
  visitId: string;
  code: string;
  shared: SharedTableDoc | null;
} | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/guest/table?code=${encodeURIComponent(code)}`,
      { signal: withTimeout(FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      success?: boolean;
      visitId?: string;
      code?: string;
      shared?: SharedTableDoc | null;
    };
    if (!json.success || !json.visitId) return null;
    return {
      visitId: json.visitId,
      code: json.code ?? code,
      shared: json.shared ?? null,
    };
  } catch {
    return null;
  }
}

export async function pushTable(
  visitId: string,
  shared: SharedTableDoc,
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/guest/table`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      signal: withTimeout(FETCH_TIMEOUT_MS),
      body: JSON.stringify({ visitId, shared }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Kitchen progression the guest is shown after ordering. */
export type KitchenStatus = "received" | "preparing" | "ready" | "served";

/**
 * Poll the live kitchen status for a placed order. Returns null when the
 * backend is unreachable so the caller can fall back to a static message
 * instead of showing a wrong state.
 */
export async function fetchOrderStatus(
  orderNumber: string,
): Promise<KitchenStatus | null> {
  try {
    const res = await fetch(
      `${API_BASE}${withOutlet(`/api/guest/order/status?orderNumber=${encodeURIComponent(orderNumber)}`)}`,
      { signal: withTimeout(FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      success?: boolean;
      kitchenStatus?: string;
    };
    const valid: KitchenStatus[] = ["received", "preparing", "ready", "served"];
    if (
      json.success &&
      json.kitchenStatus &&
      valid.includes(json.kitchenStatus as KitchenStatus)
    ) {
      return json.kitchenStatus as KitchenStatus;
    }
    return null;
  } catch {
    return null;
  }
}

/** Result of submitting feedback — tells us whether to invite a public review. */
export interface FeedbackResult {
  rating: number;
  routePublic: boolean;
  reviewUrl: string | null;
}

/**
 * Send the guest's rating. Captured privately first, always. The response says
 * whether to invite them to a public review (happy + the outlet configured a
 * URL). Returns null when unreachable — the caller should just thank them
 * rather than imply the feedback landed.
 */
export async function submitFeedback(
  aspects: Record<string, number>,
  comment: string,
  orderNumber?: string,
): Promise<FeedbackResult | null> {
  try {
    const res = await fetch(`${API_BASE}/api/guest/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: withTimeout(FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        aspects,
        comment,
        orderNumber,
        outletId: OUTLET_ID || undefined,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      success?: boolean;
      rating?: number;
      routePublic?: boolean;
      reviewUrl?: string | null;
    };
    if (!json.success) return null;
    return {
      rating: json.rating ?? 0,
      routePublic: json.routePublic === true,
      reviewUrl: json.reviewUrl ?? null,
    };
  } catch {
    return null;
  }
}

/** What the table is asking the floor for. */
export type ServiceType = "water" | "assistance" | "bill";

/**
 * Raise a "call the server" request from the table. Repeat taps of the same
 * type coalesce server-side into one open request. Returns true when the floor
 * has it, false if the backend is unreachable (caller should say so rather
 * than imply a server is coming).
 */
export async function requestService(
  orderNumber: string,
  type: ServiceType,
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/guest/service`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: withTimeout(FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        orderNumber,
        type,
        outletId: OUTLET_ID || undefined,
      }),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}

/** How the table is paying. Record-only — the app makes no charge. */
export type PaymentMethod = "cash" | "card" | "upi";

/** How the bill was divided (record-only; the split is computed client-side). */
export type SplitMode = "even" | "item";

export interface SettleOptions {
  tipAmount?: number;
  splitMode?: SplitMode;
  splitCount?: number;
}

/**
 * Record how the guest is paying for a placed order and settle the table,
 * optionally with a tip and how the bill was split. Makes NO charge — it notes
 * the method the guest pays with at the table (cash / card machine / UPI app).
 * Returns true on success, false if the backend is unreachable or declines.
 */
export async function settlePayment(
  orderNumber: string,
  method: PaymentMethod,
  opts: SettleOptions = {},
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/guest/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: withTimeout(FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        orderNumber,
        method,
        outletId: OUTLET_ID || undefined,
        tipAmount: opts.tipAmount,
        splitMode: opts.splitMode,
        splitCount: opts.splitCount,
      }),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}

/** An itemized receipt for a placed order. */
export interface Receipt {
  restaurant: { name: string; location: string };
  orderNumber: string;
  orderDate: string;
  items: { name: string; qty: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  gst: number;
  total: number;
  tip: number;
  grandTotal: number;
  paymentMethod: PaymentMethod | null;
  settledAt: string | null;
  splitMode: SplitMode | null;
  splitCount: number | null;
}

/** Fetch the itemized receipt for a placed order, or null if unreachable. */
export async function fetchReceipt(
  orderNumber: string,
): Promise<Receipt | null> {
  try {
    const res = await fetch(
      `${API_BASE}${withOutlet(`/api/guest/receipt?orderNumber=${encodeURIComponent(orderNumber)}`)}`,
      { signal: withTimeout(FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { success?: boolean; receipt?: Receipt };
    return json.success && json.receipt ? json.receipt : null;
  } catch {
    return null;
  }
}

export interface SubmitOrderInput {
  visitId?: string;
  phone?: string;
  partySize: number;
  groupType: GroupType | null;
  tableLabel?: string;
  kitchenNote?: string;
  members: Member[];
  cart: CartItem[];
  dishes: Dish[];
}

/**
 * Result of trying to place an order.
 *  - `ok`         → the kitchen has it; `orderNumber`/`total` are authoritative.
 *  - `unreachable`→ the backend didn't answer (offline/timeout). The order was
 *                   NOT recorded — the caller must not pretend it was.
 *  - `rejected`   → the backend answered but declined (e.g. items no longer on
 *                   the menu). `unknownItems`/`message` explain why.
 */
export type SubmitResult =
  | { status: "ok"; orderNumber: string; total: number }
  | { status: "unreachable" }
  | { status: "rejected"; message: string; unknownItems?: string[] };

export async function submitOrder(
  input: SubmitOrderInput,
): Promise<SubmitResult> {
  const dishById = new Map(input.dishes.map((d) => [d.id, d]));

  // Only name + qty matter to the server; it prices from its own menu.
  const items = input.cart
    .map((line) => {
      const dish = dishById.get(line.dishId);
      if (!dish) return null;
      return { name: dish.name, qty: line.qty };
    })
    .filter((i): i is NonNullable<typeof i> => i !== null);

  if (items.length === 0) return { status: "unreachable" };

  try {
    const res = await fetch(`${API_BASE}/api/guest/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: withTimeout(FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        outletId: OUTLET_ID || undefined,
        visitId: input.visitId,
        phone: input.phone,
        partySize: input.partySize,
        groupType: input.groupType,
        tableLabel: input.tableLabel,
        kitchenNote: input.kitchenNote,
        members: input.members.map((m) => ({
          name: m.name,
          diet: m.diet,
          allergens: m.allergies ?? [],
        })),
        items,
      }),
    });

    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      orderNumber?: string;
      total?: number;
      error?: string;
      unknownItems?: string[];
    } | null;

    if (res.ok && json?.success && json.orderNumber) {
      return {
        status: "ok",
        orderNumber: json.orderNumber,
        total: json.total ?? 0,
      };
    }
    // A structured refusal (bad items, table closed, etc.) — surface it.
    if (json?.error) {
      return {
        status: "rejected",
        message: json.error,
        unknownItems: json.unknownItems,
      };
    }
    return { status: "unreachable" };
  } catch {
    return { status: "unreachable" };
  }
}
