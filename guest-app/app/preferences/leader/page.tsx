"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Share2 } from "lucide-react";
import { Shell, ActionBar } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Stepper } from "@/components/ui/stepper";
import { useFlow } from "@/hooks/use-flow";
import { useGuard } from "@/hooks/use-guard";
import { useToast } from "@/components/ui/toast";
import {
  ALLERGEN_LABELS,
  DIET_LABELS,
  QUICK_ALLERGENS as SHARED_QUICK_ALLERGENS,
  TASTE_DESCRIPTIONS,
  TASTE_EMOJI,
  TASTE_LABELS,
  mapOtherAllergy,
} from "@/lib/utils";
import type { Allergen, DietPreference, TastePreference } from "@/types";

const DIETS = Object.keys(DIET_LABELS) as DietPreference[];
const TASTES = Object.keys(TASTE_LABELS) as TastePreference[];
// Keep the list short — three common ones, everything else goes in "Other".
const QUICK_ALLERGENS = SHARED_QUICK_ALLERGENS as readonly Allergen[];

export default function LeaderProxyPreferences() {
  const router = useRouter();
  const toast = useToast();
  const { state, patch, upsertMember } = useFlow();
  const ready = useGuard(state.verified && state.prefMode === "leader-proxy", "/preferences");

  const leader = state.members.find((m) => m.isLeader);
  const [diets, setDiets] = useState<Partial<Record<DietPreference, number>>>(
    state.groupPrefs.diets ?? {}
  );
  const [tastes, setTastes] = useState<TastePreference[]>(
    state.groupPrefs.tastes ?? []
  );
  const [lastTaste, setLastTaste] = useState<TastePreference | null>(null);
  // The safety rule is "no reporting allergies for OTHERS" — the leader can
  // still declare their own, which the engine hard-excludes as usual.
  const [ownAllergies, setOwnAllergies] = useState<Allergen[]>(
    leader?.allergies ?? []
  );
  const [otherOpen, setOtherOpen] = useState(!!leader?.otherAllergy);
  const [otherAllergy, setOtherAllergy] = useState(leader?.otherAllergy ?? "");

  if (!ready) return null;

  // Tapping the chip selects it, then keeps counting up; the minus steps
  // back down and removes the diet below one.
  const tapDiet = (d: DietPreference) => {
    const max = state.partySize ?? 20;
    setDiets((prev) => ({ ...prev, [d]: Math.min(max, (prev[d] ?? 0) + 1) }));
  };

  const stepDiet = (d: DietPreference, delta: number) => {
    const max = state.partySize ?? 20;
    setDiets((prev) => {
      const count = (prev[d] ?? 0) + delta;
      if (count < 1) {
        const next = { ...prev };
        delete next[d];
        return next;
      }
      return { ...prev, [d]: Math.min(max, count) };
    });
  };

  const shareTable = async () => {
    const tableCode =
      state.tableCode ?? `AV-${String(Math.floor(1000 + Math.random() * 9000))}`;
    if (!state.tableCode) patch({ tableCode });
    const link = `https://cooklyt.app/join/${tableCode}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join our table on Cooklyt",
          text: `Join our table (code ${tableCode}) and set your own preferences.`,
          url: link,
        });
        return;
      } catch {
        /* dismissed — fall through to copy */
      }
    }
    if (navigator.clipboard) navigator.clipboard.writeText(link).catch(() => {});
    toast("Invite link copied", "success");
  };

  const save = () => {
    patch({ groupPrefs: { diets, tastes } });
    if (leader) {
      const note = otherOpen ? otherAllergy.trim() : "";
      // Recognise common free-text allergies so the engine still excludes them.
      const mapped = mapOtherAllergy(note) as Allergen[];
      upsertMember({
        ...leader,
        allergies: [...new Set([...ownAllergies, ...mapped])],
        otherAllergy: note || undefined,
        prefsComplete: true,
      });
    }
    router.push("/loading");
  };

  const dietTotal = Object.values(diets).reduce((n, c) => n + (c ?? 0), 0);
  const overCount =
    state.partySize !== null && dietTotal > state.partySize ? dietTotal : null;

  return (
    <Shell back="/members" progress={70}>
      <h1 className="font-display text-3xl font-semibold leading-tight">
        What&apos;s your table into?
      </h1>
      <p className="mt-2 text-stone">
        One quick pass — we tune everyone&apos;s picks to it.
      </p>

      {/* Compact setup: how the table eats + your allergies, one row each. */}
      <Card className="mt-6 p-5">
        <div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone">
              How the table eats
            </h2>
            {overCount !== null && (
              <span className="text-xs font-medium text-danger">
                {overCount} of {state.partySize}
              </span>
            )}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {DIETS.map((d) => {
              const selected = d in diets;
              return (
                <div key={d} className="flex items-center gap-1.5">
                  <Chip selected={selected} onClick={() => tapDiet(d)}>
                    {DIET_LABELS[d]}
                  </Chip>
                  <AnimatePresence>
                    {selected && (
                      <motion.div
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                      >
                        <Stepper
                          size="sm"
                          shape="pill"
                          value={diets[d] ?? 1}
                          label={DIET_LABELS[d]}
                          onStep={(delta) => stepDiet(d, delta)}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 border-t border-separator pt-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone">
            Allergies — yours only
          </h2>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {QUICK_ALLERGENS.map((a) => (
              <Chip
                key={a}
                selected={ownAllergies.includes(a)}
                onClick={() =>
                  setOwnAllergies(
                    ownAllergies.includes(a)
                      ? ownAllergies.filter((x) => x !== a)
                      : [...ownAllergies, a]
                  )
                }
              >
                {ALLERGEN_LABELS[a]}
              </Chip>
            ))}
            <Chip selected={otherOpen} onClick={() => setOtherOpen(!otherOpen)}>
              Other
            </Chip>
          </div>
          <AnimatePresence>
            {otherOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
              >
                <input
                  value={otherAllergy}
                  onChange={(e) => setOtherAllergy(e.target.value)}
                  placeholder="e.g. shellfish, sesame, mustard…"
                  aria-label="Other allergy"
                  className="mt-3 block h-12 w-full rounded-xl glass-input border border-white/60 px-4 text-base outline-none transition-colors placeholder:text-stone/70 focus:border-ember focus:ring-2 focus:ring-ember/15"
                />
                <p className="mt-2 text-xs text-stone">
                  We&apos;ll filter dishes where we recognise it, and pass it to
                  the kitchen with your order either way.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>

      {/* The main event: the table's mood, as big tappable tiles. */}
      <h2 className="mt-8 font-display text-xl font-semibold">
        What&apos;s the mood tonight?
      </h2>
      <p className="mt-1 text-sm text-stone">
        Tap all that fit — this shapes the picks most.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {TASTES.map((t) => {
          const selected = tastes.includes(t);
          return (
            <button
              key={t}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                const removing = tastes.includes(t);
                // Describe what was just picked; clear it when unpicked.
                setLastTaste(removing ? null : t);
                setTastes(
                  removing ? tastes.filter((x) => x !== t) : [...tastes, t]
                );
              }}
              className={`flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all duration-150 active:scale-[0.98] ${
                selected
                  ? "border-saffron bg-saffron-soft/70 shadow-lift"
                  : "border-transparent bg-fill hover:bg-fill-strong"
              }`}
            >
              <span aria-hidden className="text-2xl leading-none">
                {TASTE_EMOJI[t]}
              </span>
              <span className="font-display text-[15px] font-semibold leading-tight text-ink">
                {TASTE_LABELS[t]}
              </span>
            </button>
          );
        })}
      </div>
      <AnimatePresence mode="wait">
        {lastTaste && (
          <motion.p
            key={lastTaste}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 text-sm leading-relaxed text-ink-soft"
          >
            <span className="font-semibold">{TASTE_LABELS[lastTaste]}</span> —{" "}
            {TASTE_DESCRIPTIONS[lastTaste]}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Someone else allergic? Hand off per-person or share the link. */}
      <p className="mt-6 text-xs leading-relaxed text-stone">
        Someone else allergic? They answer for themselves —{" "}
        <button
          className="font-semibold text-ember underline-offset-2 hover:underline"
          onClick={() => {
            patch({ prefMode: "per-person" });
            router.push("/preferences/per-person");
          }}
        >
          enter per person
        </button>{" "}
        or send them the table link:
      </p>
      <Button
        variant="outline"
        size="sm"
        className="mt-2.5"
        onClick={shareTable}
      >
        <Share2 className="size-4" />
        Share table link
      </Button>

      <ActionBar>
        <Button
          variant="ghost"
          size="lg"
          onClick={() => {
            patch({ prefMode: "skipped" });
            router.push("/loading");
          }}
        >
          Skip
        </Button>
        <Button fullWidth size="lg" onClick={save}>
          Find our dishes
        </Button>
      </ActionBar>
    </Shell>
  );
}
