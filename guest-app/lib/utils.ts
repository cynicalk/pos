import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number) {
  return `₹${price.toLocaleString("en-IN")}`;
}

/** The short allergy chip list — everything else goes through free text. */
export const QUICK_ALLERGENS = ["nuts", "dairy", "gluten"] as const;

/** Free-text allergies the engine can still hard-exclude when recognised. */
export const OTHER_ALLERGY_KEYWORDS: [RegExp, string][] = [
  [/shellfish|prawn|shrimp|crab|lobster/i, "shellfish"],
  [/egg/i, "egg"],
  [/soy/i, "soy"],
  [/nut|peanut|almond|cashew/i, "nuts"],
  [/dairy|milk|lactose|paneer/i, "dairy"],
  [/gluten|wheat/i, "gluten"],
];

export function mapOtherAllergy(note: string): string[] {
  if (!note.trim()) return [];
  return OTHER_ALLERGY_KEYWORDS.filter(([re]) => re.test(note)).map(
    ([, allergen]) => allergen
  );
}

/**
 * Free-text retune parsing. The engine only understands the fixed refine-tag
 * ids, so map recognisable phrases in what the table typed onto those ids —
 * anything unrecognised still rides along as a note for the kitchen/context.
 */
export const RETUNE_KEYWORDS: [RegExp, string][] = [
  [/veg|vegetarian|paneer|plant/i, "more-veg"],
  [/premium|fancy|luxe|special|expensive|indulg/i, "more-premium"],
  [/light|healthy|fresh|less heavy|lighter/i, "lighter"],
  [/spic|hot|chilli|chili|heat|fiery/i, "spicier"],
  [/shar|platter|group|family style/i, "more-sharing"],
  [/budget|cheap|afford|wallet|value|less expensive/i, "budget"],
];

export function mapRetuneNote(note: string): string[] {
  if (!note.trim()) return [];
  return [
    ...new Set(
      RETUNE_KEYWORDS.filter(([re]) => re.test(note)).map(([, id]) => id)
    ),
  ];
}

export const ALLERGEN_LABELS: Record<string, string> = {
  nuts: "Tree nuts",
  dairy: "Dairy",
  gluten: "Gluten",
  shellfish: "Shellfish",
  egg: "Egg",
  soy: "Soy",
};

export const DIET_LABELS: Record<string, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  jain: "Jain",
  "non-vegetarian": "Non-vegetarian",
  "no-preference": "Eats everything",
};

export const TASTE_DESCRIPTIONS: Record<string, string> = {
  spicy: "Bold chillies and fiery gravies — dishes that pack real heat.",
  mild: "Gentle spicing, comfort-first — nothing that makes you reach for water.",
  light: "Fresh, clean plates — salads, grills, and lighter gravies.",
  indulgent: "Creamy, buttery, celebratory — the richest dishes on the menu.",
  adventurous: "Chef's wild cards — unexpected pairings and specials worth a gamble.",
  classic: "The crowd-pleasers everyone knows and loves, done properly.",
};

export const TASTE_LABELS: Record<string, string> = {
  spicy: "Bring the heat",
  mild: "Keep it mild",
  light: "Light & fresh",
  indulgent: "Rich & indulgent",
  adventurous: "Surprise me",
  classic: "The classics",
};

export const TASTE_EMOJI: Record<string, string> = {
  spicy: "🌶️",
  mild: "🥛",
  light: "🥗",
  indulgent: "🧈",
  adventurous: "🎲",
  classic: "⭐",
};
