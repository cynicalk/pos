"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Info } from "lucide-react";
import { Shell, ActionBar } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { AllergyBanner } from "@/features/allergy-banner";
import { RecommendationCard } from "@/features/recommendation-card";
import { DishDetail } from "@/components/dish-detail";
import { useFlow } from "@/hooks/use-flow";
import { useGuard } from "@/hooks/use-guard";
import { useLang } from "@/hooks/use-lang";
import { useMenu } from "@/hooks/use-menu";
import { collectAllergens } from "@/lib/recommend";
import { formatPrice } from "@/lib/utils";
import type { Dish } from "@/types";

const CATEGORY_LABELS: Record<Dish["category"], string> = {
  starters: "Starters",
  mains: "Mains",
  "breads-rice": "Breads & Rice",
  desserts: "Desserts",
  drinks: "Drinks",
};

function MenuContent() {
  const router = useRouter();
  const params = useSearchParams();
  const capped = params.get("capped") === "1";
  const browse = params.get("browse") === "1";
  const { state, setCartQty } = useFlow();
  const { dishes: menuDishes } = useMenu();
  const { t } = useLang();
  const ready = useGuard(state.verified && state.partySize !== null);
  const [detail, setDetail] = useState<Dish | null>(null);

  if (!ready) return null;

  const allergens = collectAllergens(state.members);
  const dishes = menuDishes.filter(
    (d) => !d.allergens.some((a) => allergens.includes(a)),
  );

  const cartCount = state.cart.reduce((n, c) => n + c.qty, 0);
  const cartTotal = state.cart.reduce((sum, c) => {
    const dish = menuDishes.find((d) => d.id === c.dishId);
    return sum + (dish ? dish.price * c.qty : 0);
  }, 0);
  const qtyOf = (id: string) =>
    state.cart.find((c) => c.dishId === id)?.qty ?? 0;

  const categories = Object.keys(CATEGORY_LABELS) as Dish["category"][];

  return (
    <Shell
      back={
        capped || (browse && state.recommendations.length > 0)
          ? "/recommendations"
          : "/members"
      }
      progress={82}
      wide
    >
      <h1 className="font-display text-3xl font-semibold leading-tight">
        {t("menu.title")}
      </h1>
      <p className="mt-2 text-stone">{t("menu.subtitle")}</p>

      {capped && (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-saffron/30 bg-saffron-soft px-4 py-3">
          <Info className="mt-0.5 size-5 shrink-0 text-saffron" />
          <p className="text-sm leading-relaxed text-ink-soft">
            We&apos;ve given the picks our three best tries — sometimes
            it&apos;s just easier to browse. The whole menu is yours; anything
            you add goes straight to your order.
          </p>
        </div>
      )}

      <div className="mt-5">
        <AllergyBanner allergens={allergens} />
      </div>

      {categories.map((cat) => {
        const items = dishes.filter((d) => d.category === cat);
        if (items.length === 0) return null;
        return (
          <section key={cat} className="mt-8">
            <h2 className="mb-3 font-display text-xl font-semibold">
              {CATEGORY_LABELS[cat]}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {items.map((dish) => (
                <div key={dish.id} className="relative">
                  <RecommendationCard
                    dish={dish}
                    qty={qtyOf(dish.id)}
                    onQtyChange={(q) =>
                      setCartQty(dish.id, q, undefined, "menu")
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setDetail(dish)}
                    aria-label={`Details for ${dish.name}`}
                    className="absolute right-2.5 top-2.5 flex size-7 items-center justify-center rounded-full bg-fill text-ink-soft transition-colors hover:bg-fill-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/60"
                  >
                    <Info className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <ActionBar>
        <Button
          fullWidth
          size="lg"
          disabled={cartCount === 0}
          onClick={() => router.push("/order")}
        >
          {cartCount === 0
            ? t("menu.addToContinue")
            : `Review order · ${cartCount} item${cartCount > 1 ? "s" : ""} · ${formatPrice(cartTotal)}`}
        </Button>
      </ActionBar>

      <DishDetail dish={detail} onClose={() => setDetail(null)} />
    </Shell>
  );
}

export default function FullMenu() {
  return (
    <Suspense fallback={null}>
      <MenuContent />
    </Suspense>
  );
}
