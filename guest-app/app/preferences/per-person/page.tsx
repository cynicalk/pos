"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Shell, ActionBar } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { MemberAvatar } from "@/features/member-card";
import { useFlow } from "@/hooks/use-flow";
import { useGuard } from "@/hooks/use-guard";
import {
  ALLERGEN_LABELS,
  DIET_LABELS,
  QUICK_ALLERGENS,
  TASTE_DESCRIPTIONS,
  TASTE_EMOJI,
  TASTE_LABELS,
  mapOtherAllergy,
} from "@/lib/utils";
import type { Allergen, DietPreference, TastePreference } from "@/types";

const DIETS = Object.keys(DIET_LABELS) as DietPreference[];
const TASTES = Object.keys(TASTE_LABELS) as TastePreference[];
const ALLERGENS = QUICK_ALLERGENS as readonly Allergen[];

export default function PerPersonPreferences() {
  const router = useRouter();
  const { state, upsertMember } = useFlow();
  const ready = useGuard(state.verified && state.prefMode === "per-person", "/preferences");

  const [index, setIndex] = useState(0);
  const [diet, setDiet] = useState<DietPreference | undefined>();
  const [tastes, setTastes] = useState<TastePreference[]>([]);
  const [allergies, setAllergies] = useState<Allergen[]>([]);
  const [lastTaste, setLastTaste] = useState<TastePreference | null>(null);
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherAllergy, setOtherAllergy] = useState("");

  if (!ready) return null;

  // Guests who joined from their own phone already set their preferences
  // there — only pass the phone to the rest.
  const members = state.members.filter((m) => m.joinedVia !== "device");
  const member = members[index];
  const isLast = index === members.length - 1;

  const loadMember = (i: number) => {
    const m = members[i];
    setDiet(m?.diet);
    setTastes(m?.tastes ?? []);
    setAllergies(m?.allergies ?? []);
    setLastTaste(null);
    setOtherOpen(!!m?.otherAllergy);
    setOtherAllergy(m?.otherAllergy ?? "");
  };

  const advance = () => {
    if (isLast) {
      router.push("/loading");
    } else {
      const next = index + 1;
      setIndex(next);
      loadMember(next);
      // Respect the OS motion preference — CSS scroll-behavior doesn't apply
      // to an explicit `behavior: "smooth"` here, so gate it ourselves.
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    }
  };

  const save = () => {
    const note = otherOpen ? otherAllergy.trim() : "";
    // Recognise common free-text allergies so the engine still excludes them.
    const mapped = mapOtherAllergy(note) as Allergen[];
    upsertMember({
      ...member,
      diet,
      tastes,
      allergies: [...new Set([...allergies, ...mapped])],
      otherAllergy: note || undefined,
      prefsComplete: true,
    });
    advance();
  };

  const toggle = <T,>(list: T[], value: T, set: (v: T[]) => void) => {
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  };

  return (
    <Shell back="/preferences" progress={70}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-stone">
          {index + 1} of {members.length}
        </p>
        <div className="flex gap-1.5">
          {members.map((m, i) => (
            <span
              key={m.id}
              className={`h-1.5 rounded-full transition-all ${
                i < index
                  ? "w-4 bg-sage"
                  : i === index
                    ? "w-8 bg-ember"
                    : "w-4 bg-parchment"
              }`}
            />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={member.id}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.25 }}
        >
          <div className="mt-6 flex items-center gap-3">
            <MemberAvatar name={member.name} index={index} />
            <div>
              <h1 className="font-display text-2xl font-semibold leading-tight">
                {member.isLeader ? "Your preferences" : `Pass the phone to ${member.name}`}
              </h1>
              <p className="text-sm text-stone">
                {member.isLeader
                  ? "Answer for yourself here"
                  : `${member.name}, these answers are yours alone`}
              </p>
            </div>
          </div>

          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone">
              How do you eat?
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {DIETS.map((d) => (
                <Chip
                  key={d}
                  selected={diet === d}
                  onClick={() => setDiet(diet === d ? undefined : d)}
                >
                  {DIET_LABELS[d]}
                </Chip>
              ))}
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone">
              Any allergies?
            </h2>
            <p className="mt-1 text-sm text-stone">
              We&apos;ll strictly keep these off the table.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {ALLERGENS.map((a) => (
                <Chip
                  key={a}
                  selected={allergies.includes(a)}
                  onClick={() => toggle(allergies, a, setAllergies)}
                >
                  {ALLERGEN_LABELS[a]}
                </Chip>
              ))}
              <Chip selected={otherOpen} onClick={() => setOtherOpen(!otherOpen)}>
                Other
              </Chip>
            </div>
            {otherOpen && (
              <>
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
              </>
            )}
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone">
              What are you in the mood for?
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {TASTES.map((t) => {
                const selected = tastes.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      const removing = tastes.includes(t);
                      setLastTaste(removing ? null : t);
                      toggle(tastes, t, setTastes);
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
                  <span className="font-semibold">{TASTE_LABELS[lastTaste]}</span>{" "}
                  — {TASTE_DESCRIPTIONS[lastTaste]}
                </motion.p>
              )}
            </AnimatePresence>
          </section>
        </motion.div>
      </AnimatePresence>

      <ActionBar>
        <Button variant="ghost" size="lg" onClick={advance}>
          Skip
        </Button>
        <Button fullWidth size="lg" onClick={save}>
          {isLast ? "Done — find our dishes" : `Save & pass on`}
        </Button>
      </ActionBar>
    </Shell>
  );
}
