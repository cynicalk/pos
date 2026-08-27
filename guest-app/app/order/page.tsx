"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ReceiptText, RotateCcw, UtensilsCrossed } from "lucide-react";
import { Shell, ActionBar } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Stepper } from "@/components/ui/stepper";
import { DishTile } from "@/features/dish-tile";
import { useFlow } from "@/hooks/use-flow";
import { useGuard } from "@/hooks/use-guard";
import { useToast } from "@/components/ui/toast";
import { useMenu } from "@/hooks/use-menu";
import { submitOrder } from "@/lib/backend";
import { formatPrice } from "@/lib/utils";
import { track } from "@/lib/analytics";

export default function OrderSummary() {
  const router = useRouter();
  const toast = useToast();
  const { state, setCartQty, patch } = useFlow();
  const { dishes: DISHES, suggestUpsells } = useMenu();
  const ready = useGuard(state.verified && state.partySize !== null);
  const [placing, setPlacing] = useState(false);

  // A retune note is a kitchen-facing request ("no coriander") as much as a
  // picks one — seed the kitchen note with it so the words reach the kitchen.
  useEffect(() => {
    if (ready && !state.kitchenNote && state.refineNote) {
      patch({ kitchenNote: state.refineNote });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!ready) return null;

  const lines = state.cart
    .map((c) => ({
      dish: DISHES.find((d) => d.id === c.dishId)!,
      qty: c.qty,
      addedBy: c.addedBy,
    }))
    .filter((l) => l.dish);

  const subtotal = lines.reduce((s, l) => s + l.dish.price * l.qty, 0);
  const gst = Math.round(subtotal * 0.05);
  const total = subtotal + gst;

  // Smart Upsells: co-order complements to what's already in the cart,
  // allergen-safe by construction.
  const upsells = suggestUpsells(state.cart, state.members, 2);

  const placeOrder = async () => {
    setPlacing(true);
    // Acceptance payoff: how much of the basket came from the AI picks vs the
    // menu (manual search) vs a joined guest.
    const bySource = state.cart.reduce<Record<string, number>>((acc, c) => {
      const key = c.source ?? "unknown";
      acc[key] = (acc[key] ?? 0) + c.qty;
      return acc;
    }, {});
    const items = state.cart.reduce((n, c) => n + c.qty, 0);

    // Send to the operator backend: creates the visit + order in the shared
    // database, where it sits beside Swiggy/Zomato orders and feeds the
    // affinity mining.
    const result = await submitOrder({
      visitId: state.visitId ?? undefined,
      phone: state.phone || undefined,
      partySize: state.partySize ?? (state.members.length || 1),
      groupType: state.groupType,
      tableLabel: state.tableCode ?? undefined,
      kitchenNote: state.kitchenNote || undefined,
      members: state.members,
      cart: state.cart,
      dishes: DISHES,
    });

    if (result.status !== "ok") {
      // Don't fabricate a confirmation — the order was NOT recorded. Tell the
      // guest plainly and let them retry; the cart is untouched.
      setPlacing(false);
      track("order_failed", { reason: result.status, items, total });
      toast(
        result.status === "rejected"
          ? result.message
          : "Couldn't reach the kitchen — check your connection and try again.",
        "warning"
      );
      return;
    }

    track("order_placed", {
      orderNumber: result.orderNumber,
      items,
      total: result.total,
      bySource,
      recoShare: items > 0 ? (bySource.reco ?? 0) / items : 0,
      refineRounds: state.refineRounds,
      syncedToBackend: true,
    });
    setTimeout(() => {
      // The success screen empties the cart once it mounts — clearing it here
      // would flash the "order sent" empty state during the transition.
      patch({ orderNumber: result.orderNumber });
      router.push("/success");
    }, 300);
  };

  return (
    <Shell back="/recommendations" progress={90}>
      <h1 className="font-display text-3xl font-semibold leading-tight">
        Your order
      </h1>
      <p className="mt-2 text-stone">
        Table for {state.partySize} · sent straight to the kitchen
      </p>

      {lines.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<ReceiptText className="size-5" />}
            title={
              state.orderNumber
                ? `Order ${state.orderNumber} is with the kitchen`
                : "Nothing here yet"
            }
            description={
              state.orderNumber
                ? "Still hungry? Anything you add now goes in as a follow-on order."
                : "Head back and add a few dishes to your order."
            }
            action={
              state.orderNumber ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => router.push("/success")}>
                    Continue
                  </Button>
                  {state.lastOrderCart.length > 0 && (
                    <Button
                      variant="outline"
                      onClick={() => patch({ cart: state.lastOrderCart })}
                    >
                      <RotateCcw className="size-4" />
                      Reorder the same dishes
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => router.push("/recommendations")}
                  >
                    Back to picks
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => router.push("/recommendations")}
                >
                  Back to picks
                </Button>
              )
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-6 space-y-2.5">
            {lines.map(({ dish, qty, addedBy }) => (
              <Card key={dish.id} className="flex items-center gap-3 p-3.5">
                <DishTile dish={dish} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{dish.name}</p>
                  <p className="text-sm text-stone">
                    {formatPrice(dish.price)} each
                    {addedBy && (
                      <span className="ml-2 rounded-full bg-sage-soft px-2 py-0.5 text-xs font-medium text-sage">
                        Added by {addedBy}
                      </span>
                    )}
                  </p>
                </div>
                <Stepper
                  size="sm"
                  value={qty}
                  label={dish.name}
                  onStep={(d) => {
                    const next = qty + d;
                    setCartQty(dish.id, next, addedBy);
                    if (next <= 0) {
                      toast(`${dish.name} removed`, "info", {
                        label: "Undo",
                        onClick: () => setCartQty(dish.id, qty, addedBy),
                      });
                    }
                  }}
                />
                <span className="w-16 text-right text-sm font-semibold">
                  {formatPrice(dish.price * qty)}
                </span>
              </Card>
            ))}
          </div>

          <button
            onClick={() => router.push("/recommendations")}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-dashed border-ink/20 py-3 text-sm font-medium text-ink-soft transition-colors hover:border-ink/40 hover:text-ink"
          >
            <UtensilsCrossed className="size-4" />
            Add more dishes
          </button>

          {upsells.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 text-sm font-medium text-ink-soft">
                Goes well with your order
              </p>
              <div className="space-y-2.5">
                {upsells.map(({ dish, reason }) => (
                  <Card key={dish.id} className="flex items-center gap-3 p-3.5">
                    <DishTile dish={dish} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{dish.name}</p>
                      <p className="text-xs text-sage">{reason}</p>
                    </div>
                    <span className="text-sm font-semibold">
                      {formatPrice(dish.price)}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => {
                        setCartQty(dish.id, 1, undefined, "upsell");
                        toast(`${dish.name} added`, "success");
                      }}
                    >
                      Add
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6">
            <label
              htmlFor="kitchen-note"
              className="mb-1.5 block text-sm font-medium text-ink-soft"
            >
              Anything the kitchen should know?{" "}
              <span className="text-stone">(optional)</span>
            </label>
            <textarea
              id="kitchen-note"
              value={state.kitchenNote}
              onChange={(e) => patch({ kitchenNote: e.target.value })}
              rows={2}
              placeholder="Less spicy, no onion, birthday at the table…"
              className="w-full resize-none rounded-xl glass-input border border-white/60 p-4 text-base outline-none transition-colors placeholder:text-stone/70 focus:border-ember focus:ring-2 focus:ring-ember/15"
            />
          </div>

          <Card className="mt-6 p-4">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-stone">Subtotal</dt>
                <dd className="font-medium">{formatPrice(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone">GST (5%)</dt>
                <dd className="font-medium">{formatPrice(gst)}</dd>
              </div>
              <div className="flex justify-between border-t border-separator pt-2 text-base">
                <dt className="font-semibold">To pay at the table</dt>
                <dd className="font-display text-lg font-semibold">
                  {formatPrice(total)}
                </dd>
              </div>
            </dl>
          </Card>

          <p className="mt-4 text-center text-xs text-stone">
            Pay after your meal — cash, card or UPI at the table.
          </p>
        </>
      )}

      {lines.length > 0 && (
        <ActionBar>
          <Button fullWidth size="lg" onClick={placeOrder} loading={placing}>
            {placing ? "Sending to kitchen" : `Place order · ${formatPrice(total)}`}
          </Button>
        </ActionBar>
      )}
    </Shell>
  );
}
