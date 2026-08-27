"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Check,
  Banknote,
  CreditCard,
  Smartphone,
  Users,
  Receipt as ReceiptIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFlow } from "@/hooks/use-flow";
import { useGuard } from "@/hooks/use-guard";
import { useMenu } from "@/hooks/use-menu";
import {
  settlePayment,
  type PaymentMethod,
  type SplitMode,
} from "@/lib/backend";

// Record-only "pay at table": the guest tells us how they're paying (cash, a
// card machine, a UPI app), optionally with a tip and how they split the bill,
// so the floor can reconcile — the app makes NO charge. If the backend is
// unreachable, we say so and keep the screen rather than pretend it settled.

const METHODS: { key: PaymentMethod; label: string; Icon: typeof Banknote }[] =
  [
    { key: "cash", label: "Cash", Icon: Banknote },
    { key: "card", label: "Card", Icon: CreditCard },
    { key: "upi", label: "UPI", Icon: Smartphone },
  ];

const GST_RATE = 0.05;
const TIP_PCTS = [0, 5, 10, 15] as const;

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export default function Pay() {
  const router = useRouter();
  const { state } = useFlow();
  const { dishes } = useMenu();
  const ready = useGuard(!!state.orderNumber, "/members");

  const [tipPct, setTipPct] = useState<number>(0);
  const [splitMode, setSplitMode] = useState<SplitMode | null>(null);
  const [splitCount, setSplitCount] = useState<number>(
    Math.max(state.partySize ?? state.members.length ?? 1, 1),
  );
  const [pending, setPending] = useState<PaymentMethod | null>(null);
  const [settled, setSettled] = useState<PaymentMethod | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Recompute the bill from the last order + live prices, rounded the same way
  // the backend rounds it, so the total shown here matches what was recorded.
  const total = useMemo(() => {
    const priceOf = (id: string) => dishes.find((d) => d.id === id)?.price ?? 0;
    const subtotal = state.lastOrderCart.reduce(
      (sum, line) => sum + Math.round(priceOf(line.dishId)) * line.qty,
      0,
    );
    return subtotal + Math.round(subtotal * GST_RATE);
  }, [state.lastOrderCart, dishes]);

  const tip = Math.round((total * tipPct) / 100);
  const grandTotal = total + tip;
  const perPerson =
    splitMode === "even"
      ? Math.ceil(grandTotal / Math.max(splitCount, 1))
      : null;

  if (!ready) return null;

  const pay = async (method: PaymentMethod) => {
    if (!state.orderNumber || pending) return;
    setPending(method);
    setError(null);
    const ok = await settlePayment(state.orderNumber, method, {
      tipAmount: tip,
      splitMode: splitMode ?? undefined,
      splitCount: splitMode === "even" ? splitCount : undefined,
    });
    setPending(null);
    if (ok) setSettled(method);
    else
      setError(
        "Couldn't reach the restaurant — please pay with the staff at your table.",
      );
  };

  if (settled) {
    const label = METHODS.find((m) => m.key === settled)?.label ?? settled;
    return (
      <main className="lux-dark flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
          className="flex size-20 items-center justify-center rounded-full border border-saffron/50 bg-saffron/15 text-saffron"
        >
          <Check className="size-10" strokeWidth={2.5} />
        </motion.div>
        <h1 className="mt-6 font-display text-2xl font-semibold">
          All settled
        </h1>
        <p className="mt-2 text-cream/80">
          {inr(grandTotal)} marked as paid by {label}
          {tip > 0 ? ` (incl. ${inr(tip)} tip)` : ""}. Thanks for dining with
          us.
        </p>
        <div className="mt-8 w-full max-w-xs">
          <Button
            fullWidth
            size="lg"
            className="bg-saffron text-ink hover:bg-saffron/90"
            onClick={() => router.push("/receipt")}
          >
            <ReceiptIcon className="size-4" />
            View receipt
          </Button>
          <Button
            fullWidth
            size="lg"
            variant="ghost"
            className="mt-2 text-cream/70 hover:bg-white/10 hover:text-cream"
            onClick={() => router.push("/thanks")}
          >
            Done
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="lux-dark flex min-h-dvh flex-col items-center justify-center px-6 py-10 text-center">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xs"
      >
        <p className="editorial text-cream/70">Pay at the table</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">
          {inr(grandTotal)}
        </h1>
        <p className="mt-2 text-sm text-cream/70">
          Choose how you&apos;re paying — you settle with the staff at your
          table. Nothing is charged here.
        </p>

        {/* Tip */}
        <div className="mt-7 text-left">
          <p className="editorial mb-2 text-cream/60">Add a tip?</p>
          <div
            className="grid grid-cols-4 gap-1.5"
            role="group"
            aria-label="Tip"
          >
            {TIP_PCTS.map((pct) => (
              <button
                key={pct}
                type="button"
                aria-pressed={tipPct === pct}
                onClick={() => setTipPct(pct)}
                className={`rounded-xl border px-2 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron/60 ${
                  tipPct === pct
                    ? "border-saffron bg-saffron/15 text-saffron"
                    : "border-white/15 bg-white/5 text-cream/80 hover:bg-white/10"
                }`}
              >
                {pct === 0 ? "None" : `${pct}%`}
              </button>
            ))}
          </div>
          {tip > 0 && (
            <p className="editorial mt-1.5 text-cream/50">
              Tip {inr(tip)} · bill {inr(total)}
            </p>
          )}
        </div>

        {/* Split */}
        <div className="mt-6 text-left">
          <button
            type="button"
            aria-pressed={splitMode === "even"}
            onClick={() => {
              if (splitMode === "even") {
                setSplitMode(null);
              } else {
                // Seed the count from the party size at click time — reading it
                // now avoids the stale value a mount-time initializer would hold
                // if the flow state hydrated after first render.
                setSplitCount(
                  Math.max(state.partySize ?? state.members.length ?? 1, 1),
                );
                setSplitMode("even");
              }
            }}
            className={`flex w-full items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron/60 ${
              splitMode === "even"
                ? "border-saffron bg-saffron/15 text-saffron"
                : "border-white/15 bg-white/5 text-cream/80 hover:bg-white/10"
            }`}
          >
            <Users className="size-4" />
            Split evenly
          </button>
          {splitMode === "even" && (
            <div className="mt-2 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Fewer people"
                  onClick={() => setSplitCount((c) => Math.max(c - 1, 1))}
                  className="flex size-7 items-center justify-center rounded-full border border-white/20 text-lg leading-none"
                >
                  −
                </button>
                <span className="w-5 text-center tabular-nums">
                  {splitCount}
                </span>
                <button
                  type="button"
                  aria-label="More people"
                  onClick={() => setSplitCount((c) => Math.min(c + 1, 50))}
                  className="flex size-7 items-center justify-center rounded-full border border-white/20 text-lg leading-none"
                >
                  +
                </button>
              </div>
              <span className="editorial text-saffron">
                {inr(perPerson ?? 0)} each
              </span>
            </div>
          )}
        </div>

        {/* Method */}
        <div
          className="mt-7 space-y-2.5"
          role="group"
          aria-label="Payment method"
        >
          {METHODS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              disabled={pending != null}
              onClick={() => pay(key)}
              className="flex w-full items-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-5 py-3.5 text-left transition-colors hover:border-saffron/50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron/60 disabled:opacity-50"
            >
              <Icon className="size-5 text-saffron" />
              <span className="flex-1 font-medium">
                Pay {inr(grandTotal)} · {label}
              </span>
              {pending === key && (
                <span className="editorial !text-[9px] text-cream/60">
                  Settling…
                </span>
              )}
            </button>
          ))}
        </div>

        {error && (
          <p
            className="mt-4 text-sm text-danger"
            role="status"
            aria-live="polite"
          >
            {error}
          </p>
        )}

        <Button
          fullWidth
          size="lg"
          variant="ghost"
          className="mt-6 text-cream/70 hover:bg-white/10 hover:text-cream"
          onClick={() => router.push("/thanks")}
        >
          I&apos;ll settle later
        </Button>
      </motion.div>
    </main>
  );
}
