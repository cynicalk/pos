"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Share2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFlow } from "@/hooks/use-flow";
import { useGuard } from "@/hooks/use-guard";
import { fetchReceipt, type Receipt } from "@/lib/backend";

// Digital receipt: itemized bill for the placed order, pulled from the backend.
// "Share" uses the native share sheet (or clipboard) — actually emailing/SMSing
// it needs a provider, same as OTP, so that's a later wiring.

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function receiptText(r: Receipt): string {
  const lines = r.items.map((i) => `${i.qty}× ${i.name} — ${inr(i.lineTotal)}`);
  return [
    `${r.restaurant.name} — receipt`,
    `Order ${r.orderNumber}`,
    "",
    ...lines,
    "",
    `Subtotal ${inr(r.subtotal)}`,
    `GST ${inr(r.gst)}`,
    r.tip > 0 ? `Tip ${inr(r.tip)}` : null,
    `Total ${inr(r.grandTotal)}`,
    r.paymentMethod ? `Paid by ${r.paymentMethod}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export default function ReceiptPage() {
  const router = useRouter();
  const { state } = useFlow();
  const ready = useGuard(!!state.orderNumber, "/members");

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !state.orderNumber) return;
    let active = true;
    fetchReceipt(state.orderNumber).then((r) => {
      if (active) {
        setReceipt(r);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [ready, state.orderNumber]);

  const text = useMemo(() => (receipt ? receiptText(receipt) : ""), [receipt]);

  if (!ready) return null;

  const share = async () => {
    if (!receipt) return;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: `${receipt.restaurant.name} receipt`,
          text,
        });
      } else if (navigator?.clipboard) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      /* user dismissed the share sheet — nothing to do */
    }
  };

  return (
    <main className="flex min-h-dvh flex-col bg-cream px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-soft"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>

        {loading ? (
          <p className="editorial text-ink-soft">Loading your receipt…</p>
        ) : !receipt ? (
          <p className="text-ink-soft">
            Couldn&apos;t load the receipt right now. Ask the staff for a
            printed copy.
          </p>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-separator bg-white p-6 shadow-float"
          >
            <div className="text-center">
              <h1 className="font-display text-xl font-semibold">
                {receipt.restaurant.name}
              </h1>
              {receipt.restaurant.location && (
                <p className="editorial mt-0.5 text-ink-soft">
                  {receipt.restaurant.location}
                </p>
              )}
              <p className="editorial mt-3 text-ink-soft">
                Order {receipt.orderNumber}
              </p>
            </div>

            <div className="my-5 border-t border-dashed border-separator" />

            <dl className="space-y-2 text-sm">
              {receipt.items.map((i, idx) => (
                <div key={idx} className="flex justify-between gap-3">
                  <dt className="text-ink">
                    {i.qty}× {i.name}
                  </dt>
                  <dd className="tabular-nums text-ink">{inr(i.lineTotal)}</dd>
                </div>
              ))}
            </dl>

            <div className="my-5 border-t border-dashed border-separator" />

            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-soft">Subtotal</dt>
                <dd className="tabular-nums">{inr(receipt.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">GST (5%)</dt>
                <dd className="tabular-nums">{inr(receipt.gst)}</dd>
              </div>
              {receipt.tip > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Tip</dt>
                  <dd className="tabular-nums">{inr(receipt.tip)}</dd>
                </div>
              )}
              <div className="flex justify-between pt-1 font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{inr(receipt.grandTotal)}</dd>
              </div>
            </dl>

            {receipt.paymentMethod && (
              <p className="editorial mt-4 text-center text-ink-soft">
                Paid by {receipt.paymentMethod}
                {receipt.splitMode === "even" && receipt.splitCount
                  ? ` · split ${receipt.splitCount} ways`
                  : ""}
              </p>
            )}

            <Button fullWidth size="lg" className="mt-6" onClick={share}>
              <Share2 className="size-4" />
              Share receipt
            </Button>
          </motion.div>
        )}
      </div>
    </main>
  );
}
