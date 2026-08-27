"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Check,
  ChefHat,
  UtensilsCrossed,
  Wallet,
  GlassWater,
  HandPlatter,
  ReceiptText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFlow } from "@/hooks/use-flow";
import { useGuard } from "@/hooks/use-guard";
import {
  fetchOrderStatus,
  requestService,
  type KitchenStatus,
  type ServiceType,
} from "@/lib/backend";

const SERVICE_ACTIONS: {
  key: ServiceType;
  label: string;
  Icon: typeof GlassWater;
}[] = [
  { key: "water", label: "Water", Icon: GlassWater },
  { key: "assistance", label: "Help", Icon: HandPlatter },
  { key: "bill", label: "Bill", Icon: ReceiptText },
];

const KITCHEN_STEPS: { key: KitchenStatus; label: string }[] = [
  { key: "received", label: "Received" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "served", label: "Served" },
];

const KITCHEN_CAPTION: Record<KitchenStatus, string> = {
  received: "First plates in 15–20 minutes",
  preparing: "The kitchen is on it",
  ready: "Your food is ready — it's on its way over",
  served: "Enjoy your meal",
};

export default function Success() {
  const router = useRouter();
  const { state, patch } = useFlow();
  const ready = useGuard(!!state.orderNumber, "/members");

  // Live kitchen status. Starts null (unknown) and polls every 10s; if the
  // backend is unreachable it stays null and we show the static estimate,
  // exactly as before — no wrong state shown.
  const [kitchenStatus, setKitchenStatus] = useState<KitchenStatus | null>(
    null,
  );
  // Which "call the server" requests the floor has acknowledged receiving.
  const [asked, setAsked] = useState<ServiceType[]>([]);
  const [askFailed, setAskFailed] = useState(false);

  const callServer = async (type: ServiceType) => {
    if (!state.orderNumber || asked.includes(type)) return;
    const ok = await requestService(state.orderNumber, type);
    if (ok) setAsked((prev) => [...prev, type]);
    else setAskFailed(true);
  };

  useEffect(() => {
    if (!ready || !state.orderNumber) return;
    const orderNumber = state.orderNumber;
    let active = true;
    const poll = async () => {
      const s = await fetchOrderStatus(orderNumber);
      if (active && s) setKitchenStatus(s);
      return s;
    };
    poll();
    const id = setInterval(async () => {
      const s = await poll();
      // Stop polling once the meal is served — nothing further to show.
      if (s === "served") clearInterval(id);
    }, 10_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [ready, state.orderNumber]);

  // The order is with the kitchen now — empty the cart here (not on the
  // order screen) so going back can't re-place it, without the "order sent"
  // state flashing mid-transition.
  useEffect(() => {
    if (ready && state.cart.length > 0) {
      // Keep a copy so the order screen can offer one-tap reorder.
      patch({ cart: [], lastOrderCart: state.cart });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!ready) return null;

  return (
    <main className="lux-dark flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center">
      <motion.div
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.1 }}
        className="flex size-24 items-center justify-center rounded-full border border-saffron/50 bg-saffron/15 text-saffron"
      >
        <Check className="size-12" strokeWidth={2.5} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <h1 className="mt-8 font-display text-3xl font-semibold">
          Order&apos;s in!
        </h1>
        <p className="mt-3 max-w-xs text-cream/80">
          The kitchen has your order.
          {state.kitchenNote.trim() && " Your note's gone to them too."}
        </p>

        <div className="mx-auto mt-8 flex w-fit items-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-5 py-3">
          <ChefHat className="size-5 text-saffron" />
          <div className="text-left">
            <p className="editorial !text-[9px] text-cream/70">Order number</p>
            <p className="font-display text-lg font-semibold tracking-wide">
              {state.orderNumber}
            </p>
          </div>
        </div>

        {/* Live kitchen progression. Before the first successful poll
            (kitchenStatus null) we show the same static estimate as before. */}
        <div className="mx-auto mt-8 flex w-fit items-center gap-2">
          {KITCHEN_STEPS.map((step, i) => {
            const activeIdx = kitchenStatus
              ? KITCHEN_STEPS.findIndex((s) => s.key === kitchenStatus)
              : 0;
            const done = kitchenStatus != null && i <= activeIdx;
            const current = kitchenStatus != null && i === activeIdx;
            return (
              <div key={step.key} className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-1">
                  <span
                    aria-hidden
                    className={`size-2.5 rounded-full transition-colors ${
                      done ? "bg-saffron" : "bg-white/20"
                    } ${current ? "ring-2 ring-saffron/40" : ""}`}
                  />
                  <span
                    className={`editorial !text-[9px] ${
                      current ? "text-saffron" : "text-cream/50"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {i < KITCHEN_STEPS.length - 1 && (
                  <span
                    aria-hidden
                    className={`mb-4 h-px w-5 ${done ? "bg-saffron/60" : "bg-white/15"}`}
                  />
                )}
              </div>
            );
          })}
        </div>
        <p
          className="editorial mt-4 text-cream/70"
          aria-live="polite"
          role="status"
        >
          {kitchenStatus
            ? KITCHEN_CAPTION[kitchenStatus]
            : "First plates in 15–20 minutes"}
        </p>

        {/* Call the server — one tap flags the floor. */}
        <div className="mx-auto mt-7 w-full max-w-xs">
          <p className="editorial mb-2 text-cream/60">Need something?</p>
          <div
            className="grid grid-cols-3 gap-2"
            role="group"
            aria-label="Call the server"
          >
            {SERVICE_ACTIONS.map(({ key, label, Icon }) => {
              const done = asked.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  disabled={done}
                  onClick={() => callServer(key)}
                  className={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron/60 ${
                    done
                      ? "border-saffron/50 bg-saffron/15 text-saffron"
                      : "border-white/15 bg-white/5 text-cream/80 hover:bg-white/10"
                  }`}
                >
                  <Icon className="size-4" />
                  {done ? "On the way" : label}
                </button>
              );
            })}
          </div>
          {askFailed && (
            <p
              className="mt-2 text-xs text-danger"
              role="status"
              aria-live="polite"
            >
              Couldn&apos;t reach the floor — please wave down a server.
            </p>
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mt-10 w-full max-w-xs"
      >
        <Button
          fullWidth
          size="lg"
          className="bg-saffron text-ink hover:bg-saffron/90"
          onClick={() => router.push("/feedback")}
        >
          Rate the experience
        </Button>
        <Button
          fullWidth
          size="lg"
          variant="ghost"
          className="mt-2 text-cream/80 hover:bg-white/10 hover:text-cream"
          onClick={() => router.push("/order")}
        >
          <UtensilsCrossed className="size-4" />
          Order more dishes
        </Button>
        <Button
          fullWidth
          size="lg"
          variant="ghost"
          className="mt-1 text-cream/80 hover:bg-white/10 hover:text-cream"
          onClick={() => router.push("/pay")}
        >
          <Wallet className="size-4" />
          Pay at the table
        </Button>
        <Button
          fullWidth
          size="lg"
          variant="ghost"
          className="mt-1 text-cream/70 hover:bg-white/10 hover:text-cream"
          onClick={() => router.push("/thanks")}
        >
          Done
        </Button>
      </motion.div>
    </main>
  );
}
