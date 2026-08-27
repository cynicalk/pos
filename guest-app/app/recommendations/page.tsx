"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, RefreshCw, Users } from "lucide-react";
import { track } from "@/lib/analytics";
import { Shell, ActionBar } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { AllergyBanner } from "@/features/allergy-banner";
import { RecommendationCard } from "@/features/recommendation-card";
import { useFlow } from "@/hooks/use-flow";
import { useGuard } from "@/hooks/use-guard";
import { useMenu } from "@/hooks/use-menu";
import { collectAllergens } from "@/lib/recommend";
import { formatPrice } from "@/lib/utils";

export default function Recommendations() {
  const router = useRouter();
  const toast = useToast();
  const { state, setCartQty, patch } = useFlow();
  const { dishes: menuDishes } = useMenu();
  const ready = useGuard(state.recommendations.length > 0, "/members");

  // One "shown" event per set of picks — the denominator for acceptance/rejection.
  const shownRound = useRef<number | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (shownRound.current === state.refineRounds) return;
    shownRound.current = state.refineRounds;
    track("recommendations_shown", {
      round: state.refineRounds,
      count: state.recommendations.length,
      entry: state.entryPath,
    });
  }, [ready, state.refineRounds, state.recommendations.length, state.entryPath]);

  // Shared cart: a guest who joined from their own phone drops a dish into
  // the table's cart while the host is browsing. Mocked, happens once.
  useEffect(() => {
    if (!ready || state.guestCartSimulated) return;
    const guest = state.members.find((m) => m.joinedVia === "device");
    if (!guest) return;
    const pick = state.recommendations.find(
      (r) => !state.cart.some((c) => c.dishId === r.dish.id)
    );
    if (!pick) return;
    const timer = setTimeout(() => {
      setCartQty(pick.dish.id, 1, guest.name, "guest");
      patch({ guestCartSimulated: true });
      toast(`${guest.name} added ${pick.dish.name} from their phone`, "info", {
        label: "Undo",
        onClick: () => setCartQty(pick.dish.id, 0),
      });
    }, 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, state.guestCartSimulated]);

  if (!ready) return null;

  const allergens = collectAllergens(state.members);
  const cartCount = state.cart.reduce((n, c) => n + c.qty, 0);
  const cartTotal = state.cart.reduce((sum, c) => {
    const dish = menuDishes.find((d) => d.id === c.dishId);
    return sum + (dish ? dish.price * c.qty : 0);
  }, 0);

  const qtyOf = (dishId: string) =>
    state.cart.find((c) => c.dishId === dishId)?.qty ?? 0;

  const joined = state.entryPath === "join";

  return (
    <Shell back={joined ? "/" : "/members"} progress={82}>
      <h1 className="font-display text-3xl font-semibold leading-tight">
        Picked for your table
      </h1>
      <p className="mt-2 text-stone">
        {state.refineRounds > 0
          ? "Fresh picks, tuned to what you asked for."
          : "Based on who's eating and what tonight's about."}
      </p>

      {state.refineRounds > 0 && state.refineNote && (
        <p className="mt-2 text-sm italic text-ink-soft">
          &ldquo;{state.refineNote}&rdquo;
        </p>
      )}

      {joined && state.tableCode && (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-plum/25 bg-plum/5 px-4 py-3">
          <Users className="mt-0.5 size-5 shrink-0 text-plum" />
          <p className="text-sm leading-relaxed text-ink-soft">
            You&apos;re in on{" "}
            <span className="font-semibold text-ink">
              Table {state.tableCode}
            </span>
            . Anything you add drops into the group&apos;s shared cart.
          </p>
        </div>
      )}

      <div className="mt-5 space-y-4">
        <AllergyBanner allergens={allergens} />
        {state.recommendations.map((rec, i) => (
          <RecommendationCard
            key={rec.dish.id}
            dish={rec.dish}
            reason={rec.reason}
            qty={qtyOf(rec.dish.id)}
            onQtyChange={(q) => setCartQty(rec.dish.id, q, undefined, "reco")}
            index={i}
          />
        ))}
      </div>

      <div className="mt-8 rounded-card glass border-white/60 p-4 text-center">
        <p className="text-sm text-stone">
          Not quite right, or after something specific?
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" onClick={() => router.push("/refine")}>
            <RefreshCw className="size-4" />
            Tune these picks
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/menu?browse=1")}
          >
            <BookOpen className="size-4" />
            Browse full menu
          </Button>
        </div>
        <p className="mt-3 text-xs text-stone">
          The whole menu&apos;s open — add anything from it straight to your
          order.
        </p>
      </div>

      <ActionBar>
        <Button
          fullWidth
          size="lg"
          disabled={cartCount === 0}
          onClick={() => router.push("/order")}
        >
          {cartCount === 0
            ? "Add dishes to continue"
            : `Review order · ${cartCount} item${cartCount > 1 ? "s" : ""} · ${formatPrice(cartTotal)}`}
        </Button>
      </ActionBar>
    </Shell>
  );
}
