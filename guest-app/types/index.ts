export type EntryPath = "reservation" | "walkin" | "join";

export type GroupType = "date" | "family" | "friends" | "business" | "solo";

export type Allergen =
  "nuts" | "dairy" | "gluten" | "shellfish" | "egg" | "soy";

export type DietPreference =
  "vegetarian" | "vegan" | "jain" | "non-vegetarian" | "no-preference";

export type TastePreference =
  "spicy" | "mild" | "light" | "indulgent" | "adventurous" | "classic";

export interface Dish {
  id: string;
  name: string;
  description: string;
  price: number;
  category: "starters" | "mains" | "breads-rice" | "desserts" | "drinks";
  tags: string[]; // veg, vegan, jain, premium, sharing, kids, light, spicy, popular
  allergens: Allergen[];
  emoji: string;
  tone: "ember" | "saffron" | "sage" | "plum" | "sand";
  // Transparency (optional; present when the backend has it on file).
  ingredients?: string[];
  nutrition?: DishNutrition | null;
  spiceLevel?: number; // 0 none .. 3 hot
}

/** Per-serving nutrition — an estimate surfaced from the backend, labelled as such. */
export interface DishNutrition {
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

export interface Member {
  id: string;
  name: string;
  isLeader: boolean;
  diet?: DietPreference;
  tastes?: TastePreference[];
  allergies?: Allergen[];
  /** Free-text allergy the preset chips don't cover */
  otherAllergy?: string;
  phone?: string;
  prefsComplete?: boolean;
  /** Set when the guest joined the shared cart from their own phone */
  joinedVia?: "device";
}

export type PreferenceMode = "per-person" | "leader-proxy" | "skipped";

export interface GroupPrefs {
  diet?: DietPreference;
  /** Multi-select diets with a headcount per diet */
  diets?: Partial<Record<DietPreference, number>>;
  tastes?: TastePreference[];
}

/** Where a dish entered the cart — powers AI-acceptance vs manual-search metrics. */
export type CartSource = "reco" | "menu" | "reorder" | "guest" | "upsell";

export interface CartItem {
  dishId: string;
  qty: number;
  /** Guest name when the dish came in from a joined device */
  addedBy?: string;
  /** Which surface the dish was added from */
  source?: CartSource;
}

export interface Recommendation {
  dish: Dish;
  reason: string;
}

export interface FlowState {
  entryPath: EntryPath | null;
  guestName: string;
  phone: string;
  verified: boolean;
  partySize: number | null;
  groupType: GroupType | null;
  members: Member[];
  membersConfirmed: boolean;
  prefMode: PreferenceMode | null;
  groupPrefs: GroupPrefs;
  refineRounds: number;
  refineTags: string[];
  /** Free-text note from the retune screen — what the table wants changed */
  refineNote: string;
  recommendations: Recommendation[];
  cart: CartItem[];
  tableCode: string | null;
  /** Backend visit id once the shared table is opened on the server. */
  visitId: string | null;
  /** Revision of the shared cart doc last seen from the server. */
  sharedRev: number;
  guestCartSimulated: boolean;
  /** The preferences intro interstitial has already been shown once */
  prefIntroSeen: boolean;
  /** Free-text note passed to the kitchen with the order */
  kitchenNote: string;
  /** Free-text feedback left with the ratings */
  feedbackNote: string;
  /** A guest has already auto-joined live on the members screen */
  autoJoined: boolean;
  orderNumber: string | null;
  /** What the last placed order contained — powers one-tap reorder */
  lastOrderCart: CartItem[];
  ratings: {
    app: number;
    recommendations: number;
    ordering: number;
  };
}
