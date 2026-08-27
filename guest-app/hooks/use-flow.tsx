"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import type { FlowState, Member, CartItem, CartSource } from "@/types";
import { track } from "@/lib/analytics";

/**
 * The journey's fixed step map. Every screen belongs to one step, so the
 * header progress reads consistently across the whole flow.
 */
export const FLOW_STEPS = [
  {
    id: "details",
    label: "Details",
    routes: ["/reservation", "/walk-in", "/join", "/verify", "/party-size"],
  },
  {
    id: "table",
    label: "Table",
    routes: ["/dashboard", "/members", "/group-type"],
  },
  { id: "tastes", label: "Tastes", routes: ["/preferences"] },
  {
    id: "picks",
    label: "Picks",
    routes: ["/loading", "/recommendations", "/refine", "/menu"],
  },
  {
    id: "order",
    label: "Order",
    routes: ["/order", "/success", "/feedback", "/thanks"],
  },
] as const;

export function stepIndexForPath(pathname: string): number {
  return FLOW_STEPS.findIndex((s) =>
    s.routes.some((r) => pathname === r || pathname.startsWith(`${r}/`))
  );
}

const initialState: FlowState = {
  entryPath: null,
  guestName: "",
  phone: "",
  verified: false,
  partySize: null,
  groupType: null,
  members: [],
  membersConfirmed: false,
  prefMode: null,
  groupPrefs: {},
  refineRounds: 0,
  refineTags: [],
  refineNote: "",
  recommendations: [],
  cart: [],
  tableCode: null,
  visitId: null,
  sharedRev: 0,
  guestCartSimulated: false,
  prefIntroSeen: false,
  kitchenNote: "",
  feedbackNote: "",
  autoJoined: false,
  orderNumber: null,
  lastOrderCart: [],
  ratings: { app: 0, recommendations: 0, ordering: 0 },
};

type Action =
  | { type: "PATCH"; payload: Partial<FlowState> }
  | { type: "UPSERT_MEMBER"; member: Member }
  | { type: "REMOVE_MEMBER"; id: string }
  | {
      type: "SET_CART_QTY";
      dishId: string;
      qty: number;
      addedBy?: string;
      source?: CartSource;
    }
  | { type: "RESET" }
  | { type: "HYDRATE"; payload: FlowState };

function reducer(state: FlowState, action: Action): FlowState {
  switch (action.type) {
    case "PATCH":
      return { ...state, ...action.payload };
    case "UPSERT_MEMBER": {
      const exists = state.members.some((m) => m.id === action.member.id);
      return {
        ...state,
        members: exists
          ? state.members.map((m) => (m.id === action.member.id ? action.member : m))
          : [...state.members, action.member],
      };
    }
    case "REMOVE_MEMBER":
      return { ...state, members: state.members.filter((m) => m.id !== action.id) };
    case "SET_CART_QTY": {
      const existing = state.cart.find((c) => c.dishId === action.dishId);
      const rest = state.cart.filter((c) => c.dishId !== action.dishId);
      const cart: CartItem[] =
        action.qty <= 0
          ? rest
          : [
              ...rest,
              {
                dishId: action.dishId,
                qty: action.qty,
                addedBy: action.addedBy ?? existing?.addedBy,
                // Preserve the original surface when only the quantity changes.
                source: action.source ?? existing?.source,
              },
            ];
      return { ...state, cart };
    }
    case "RESET":
      return initialState;
    case "HYDRATE":
      // Merge over defaults so sessions saved by an older state shape can't
      // drop fields added since.
      return { ...initialState, ...action.payload };
    default:
      return state;
  }
}

interface FlowContextValue {
  state: FlowState;
  hydrated: boolean;
  patch: (payload: Partial<FlowState>) => void;
  upsertMember: (member: Member) => void;
  removeMember: (id: string) => void;
  setCartQty: (
    dishId: string,
    qty: number,
    addedBy?: string,
    source?: CartSource
  ) => void;
  reset: () => void;
}

const FlowContext = createContext<FlowContextValue | null>(null);

const STORAGE_KEY = "cooklyt-session";

export function FlowProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        dispatch({ type: "HYDRATE", payload: JSON.parse(raw) });
      } catch {
        /* stale session, start fresh */
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  // Stable value so consumers only re-render when state actually changes.
  const value: FlowContextValue = useMemo(
    () => ({
      state,
      hydrated,
      patch: (payload) => dispatch({ type: "PATCH", payload }),
      upsertMember: (member) => dispatch({ type: "UPSERT_MEMBER", member }),
      removeMember: (id) => dispatch({ type: "REMOVE_MEMBER", id }),
      setCartQty: (dishId, qty, addedBy, source) => {
        const existing = state.cart.find((c) => c.dishId === dishId);
        const prevQty = existing?.qty ?? 0;
        dispatch({ type: "SET_CART_QTY", dishId, qty, addedBy, source });
        const from = source ?? existing?.source ?? "unknown";
        if (qty > prevQty) {
          track("dish_added", { dishId, from, qty });
        } else if (qty < prevQty) {
          track("dish_removed", { dishId, from, qty });
        }
      },
      reset: () => dispatch({ type: "RESET" }),
    }),
    [state, hydrated]
  );

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow() {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error("useFlow must be used inside FlowProvider");
  return ctx;
}
