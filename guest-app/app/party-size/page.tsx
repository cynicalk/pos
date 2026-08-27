"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Users } from "lucide-react";
import { Shell, ActionBar } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { useFlow } from "@/hooks/use-flow";
import { useGuard } from "@/hooks/use-guard";

export default function PartySize() {
  const router = useRouter();
  const { state, patch } = useFlow();
  const ready = useGuard(state.verified);
  const [size, setSize] = useState(state.partySize ?? 2);

  if (!ready) return null;

  return (
    <Shell back="/verify" progress={32}>
      <h1 className="font-display text-3xl font-semibold leading-tight">
        How many at the table?
      </h1>
      <p className="mt-2 text-stone">Counting you, of course.</p>

      <div className="mt-12 flex flex-col items-center gap-6">
        <div className="flex size-24 items-center justify-center rounded-full bg-ember-soft">
          <Users className="size-10 text-ember" />
        </div>
        <div className="flex items-center gap-6">
          <button
            aria-label="Fewer people"
            onClick={() => setSize((s) => Math.max(1, s - 1))}
            className="flex size-14 items-center justify-center rounded-full glass-input border border-white/60 text-ink-soft shadow-lift transition-transform hover:border-ink/30 active:scale-95"
          >
            <Minus className="size-5" />
          </button>
          <span className="w-16 text-center font-display text-6xl font-semibold tabular-nums">
            {size}
          </span>
          <button
            aria-label="More people"
            onClick={() => setSize((s) => Math.min(20, s + 1))}
            className="flex size-14 items-center justify-center rounded-full glass-input border border-white/60 text-ink-soft shadow-lift transition-transform hover:border-ink/30 active:scale-95"
          >
            <Plus className="size-5" />
          </button>
        </div>
        <p className="text-sm text-stone">
          {size === 1 ? "A table for one" : `A table for ${size}`}
        </p>
      </div>

      <ActionBar>
        <Button
          fullWidth
          size="lg"
          onClick={() => {
            patch({ partySize: size });
            router.push("/members");
          }}
        >
          That&apos;s us
        </Button>
      </ActionBar>
    </Shell>
  );
}
