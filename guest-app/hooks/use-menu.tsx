"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Dish } from "@/types";
import {
  DISHES as BUNDLED_DISHES,
  RESTAURANT as BUNDLED_RESTAURANT,
} from "@/lib/recommend";
import { createRecommender } from "@/lib/recommend-core";
import { fetchLiveMenu } from "@/lib/menu-source";
import { useFlow } from "@/hooks/use-flow";

type Recommender = ReturnType<typeof createRecommender>;

interface MenuContextValue {
  dishes: Dish[];
  restaurant: { name: string; tagline: string; location: string };
  recommend: Recommender["recommend"];
  suggestUpsells: Recommender["suggestUpsells"];
  /** "live" once the operator menu has been adopted, else "bundled". */
  source: "live" | "bundled";
}

const MenuContext = createContext<MenuContextValue | null>(null);

/**
 * Serves the live operator menu (fetched from /api/guest/menu) to the whole
 * app, falling back to the bundled menu.json instantly and whenever the
 * backend is unreachable. The recommender is rebuilt from whichever menu is
 * active, so recommendations, upsells, and the order screen all price against
 * the same dishes the order endpoint will.
 */
export function MenuProvider({ children }: { children: ReactNode }) {
  const { state } = useFlow();
  const [dishes, setDishes] = useState<Dish[]>(BUNDLED_DISHES);
  const [restaurant, setRestaurant] = useState(BUNDLED_RESTAURANT);
  const [source, setSource] = useState<"live" | "bundled">("bundled");

  // Adopt the live menu at most once, and only while the cart is empty — after
  // that, swapping the dish set would orphan cart lines (live rows carry DB
  // ids, the bundled fallback carries d01…d25), so we keep the session on one
  // consistent menu.
  const adopted = useRef(false);
  const cartEmpty = state.cart.length === 0;

  useEffect(() => {
    if (adopted.current || !cartEmpty) return;
    let cancelled = false;
    fetchLiveMenu().then((live) => {
      if (cancelled || adopted.current || !live) return;
      // Re-check emptiness at resolve time — the user may have added an item
      // from the bundled menu while the request was in flight.
      if (state.cart.length !== 0) return;
      adopted.current = true;
      setDishes(live.dishes);
      setRestaurant(live.restaurant);
      setSource("live");
    });
    return () => {
      cancelled = true;
    };
    // Retry on the transition back to an empty cart if the first attempt raced
    // a non-empty cart; the `adopted` guard keeps a successful adoption final.
  }, [cartEmpty]); // eslint-disable-line react-hooks/exhaustive-deps

  const engine = useMemo(() => createRecommender(dishes), [dishes]);

  const value = useMemo<MenuContextValue>(
    () => ({
      dishes,
      restaurant,
      recommend: engine.recommend,
      suggestUpsells: engine.suggestUpsells,
      source,
    }),
    [dishes, restaurant, engine, source],
  );

  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}

export function useMenu(): MenuContextValue {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error("useMenu must be used within a MenuProvider");
  return ctx;
}
