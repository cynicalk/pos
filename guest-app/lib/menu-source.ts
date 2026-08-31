import type { Allergen, Dish } from "@/types";
import {
  DISHES as BUNDLED_DISHES,
  RESTAURANT as BUNDLED_RESTAURANT,
} from "@/lib/recommend";

/**
 * Fetches the live menu from the operator backend so the guest app orders and
 * prices against the SAME rows the order endpoint uses. Falls back to the
 * bundled menu.json when the backend is unreachable, so the app still works
 * offline exactly as the standalone prototype did.
 *
 * The backend is the source of truth for what's orderable and its price; the
 * bundled menu supplies the purely decorative `emoji`/`tone` (not operator
 * data) by name, with sensible per-category defaults for anything it doesn't
 * recognise.
 */

const API_BASE = process.env.NEXT_PUBLIC_COOKLYT_API ?? "http://localhost:3000";
const OUTLET_ID = process.env.NEXT_PUBLIC_COOKLYT_OUTLET ?? "";
const FETCH_TIMEOUT_MS = 8000;

interface ApiDish {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  tags: string[];
  allergens: string[];
  isVeg: boolean;
  featured?: boolean;
  spiceLevel: number | null;
  ingredients?: string[];
  nutrition?: {
    calories: number;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
  } | null;
}

export interface LiveMenu {
  dishes: Dish[];
  restaurant: { name: string; tagline: string; location: string };
}

const VALID_CATEGORIES: Dish["category"][] = [
  "starters",
  "mains",
  "breads-rice",
  "desserts",
  "drinks",
];

// Decoration (emoji/tone) keyed by dish name from the bundled menu.
const DECOR = new Map(
  BUNDLED_DISHES.map(
    (d) => [d.name, { emoji: d.emoji, tone: d.tone }] as const,
  ),
);

const CATEGORY_EMOJI: Record<string, string> = {
  starters: "🥗",
  mains: "🍛",
  "breads-rice": "🍚",
  desserts: "🍰",
  drinks: "🥤",
};

const TONES: Dish["tone"][] = ["ember", "saffron", "sage", "plum", "sand"];

// Stable tone for an unrecognised dish so it doesn't flicker between renders.
function toneFor(name: string): Dish["tone"] {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

function toDish(a: ApiDish): Dish {
  const category = (
    VALID_CATEGORIES.includes(a.category as Dish["category"])
      ? a.category
      : "mains"
  ) as Dish["category"];
  const decor = DECOR.get(a.name);
  return {
    id: a.id,
    name: a.name,
    description: a.description ?? "",
    price: a.price,
    category,
    tags: Array.isArray(a.tags) ? a.tags : [],
    featured: a.featured === true,
    allergens: (Array.isArray(a.allergens) ? a.allergens : []) as Allergen[],
    ingredients: Array.isArray(a.ingredients) ? a.ingredients : [],
    nutrition: a.nutrition ?? null,
    spiceLevel: a.spiceLevel ?? undefined,
    emoji: decor?.emoji ?? CATEGORY_EMOJI[a.category] ?? "🍽️",
    tone: decor?.tone ?? toneFor(a.name),
  };
}

function menuUrl(): string {
  const base = `${API_BASE}/api/guest/menu`;
  return OUTLET_ID ? `${base}?outlet=${encodeURIComponent(OUTLET_ID)}` : base;
}

/**
 * Returns the live menu, or null if the backend is unreachable or serves an
 * empty menu (in which case the caller keeps the bundled menu).
 */
export async function fetchLiveMenu(): Promise<LiveMenu | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(menuUrl(), { signal: controller.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      restaurant?: { name?: string; location?: string } | null;
      dishes?: ApiDish[];
    };
    if (!Array.isArray(json.dishes) || json.dishes.length === 0) return null;
    return {
      dishes: json.dishes.map(toDish),
      restaurant: {
        name: json.restaurant?.name ?? BUNDLED_RESTAURANT.name,
        // The DB has no tagline — keep the bundled branding line.
        tagline: BUNDLED_RESTAURANT.tagline,
        location: json.restaurant?.location || BUNDLED_RESTAURANT.location,
      },
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
