"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Shell, ActionBar } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useFlow } from "@/hooks/use-flow";
import { useGuard } from "@/hooks/use-guard";
import { REFINE_OPTIONS } from "@/lib/recommend";
import { mapRetuneNote } from "@/lib/utils";
import { track } from "@/lib/analytics";

const MAX_ROUNDS = 3;

export default function Refine() {
  const router = useRouter();
  const { state, patch } = useFlow();
  const ready = useGuard(state.recommendations.length > 0, "/members");
  const [tags, setTags] = useState<string[]>(state.refineTags);
  const [note, setNote] = useState<string>(state.refineNote);

  // After three rounds, stop generating and hand over the full menu. Snapshot
  // the count at mount so triggering the third regeneration from this screen
  // doesn't bounce to the menu before the new picks are shown.
  const [roundsAtEntry] = useState(state.refineRounds);
  const capped = roundsAtEntry >= MAX_ROUNDS;
  // Fire the rejection once, even under React strict-mode's double effect.
  const cappedLogged = useRef(false);
  useEffect(() => {
    if (ready && capped) {
      if (!cappedLogged.current) {
        cappedLogged.current = true;
        // Strongest rejection signal: the AI used all its tries and we fell
        // back to the full menu.
        track("reco_rejected", { reason: "capped", round: roundsAtEntry });
      }
      router.replace("/menu?capped=1");
    }
  }, [ready, capped, roundsAtEntry, router]);

  if (!ready || capped) return null;

  const roundsLeft = MAX_ROUNDS - state.refineRounds;
  // Turn what the table typed into engine tags, merged with the chips they tapped.
  const noteTags = mapRetuneNote(note);
  const mergedTags = [...new Set([...tags, ...noteTags])];
  // A typed note counts on its own — even if it maps to no tags, it rides
  // along to the kitchen so the words are never silently dropped.
  const canRegenerate = mergedTags.length > 0 || note.trim().length > 0;

  const regenerate = () => {
    // A retune is a soft rejection of the current picks — captured with the
    // direction the table asked for (tags) and whether they typed a note.
    track("reco_rejected", {
      reason: "refine",
      round: state.refineRounds,
      tags: mergedTags,
      hasNote: note.trim().length > 0,
    });
    patch({
      refineTags: mergedTags,
      refineNote: note.trim(),
      refineRounds: state.refineRounds + 1,
    });
    router.push("/loading");
  };

  return (
    <Shell back="/recommendations" progress={82}>
      <h1 className="font-display text-3xl font-semibold leading-tight">
        What should change?
      </h1>
      <p className="mt-2 text-stone">
        Pick what you&apos;d like more of and we&apos;ll redo the picks.
      </p>

      <div className="mt-8 flex flex-wrap gap-2.5">
        {REFINE_OPTIONS.map((opt) => (
          <Chip
            key={opt.id}
            selected={mergedTags.includes(opt.id)}
            onClick={() =>
              setTags(
                tags.includes(opt.id)
                  ? tags.filter((t) => t !== opt.id)
                  : [...tags, opt.id]
              )
            }
          >
            {opt.label}
          </Chip>
        ))}
      </div>

      <div className="mt-6">
        <label
          htmlFor="retune-note"
          className="mb-1.5 block text-sm font-medium text-ink-soft"
        >
          Or tell us in your own words
        </label>
        <textarea
          id="retune-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="e.g. something lighter to start, and one really spicy main to share"
          className="block w-full resize-none rounded-xl glass-input border border-white/60 px-4 py-3 text-base outline-none transition-colors placeholder:text-stone/70 focus:border-ember focus:ring-2 focus:ring-ember/15"
        />
        {note.trim() && (
          <p className="mt-2 text-xs text-sage">
            {noteTags.length > 0
              ? "Got it — we'll retune your picks around this."
              : "We'll pass this along to the kitchen with your order."}
          </p>
        )}
      </div>

      <p className="mt-6 text-sm text-stone">
        {roundsLeft === 1
          ? "Last redo — after this we'll open up the full menu for you."
          : `${roundsLeft} redos left — after that we'll open up the full menu for you.`}
      </p>

      <ActionBar>
        <Button variant="ghost" size="lg" onClick={() => router.push("/recommendations")}>
          Cancel
        </Button>
        <Button fullWidth size="lg" onClick={regenerate} disabled={!canRegenerate}>
          <RefreshCw className="size-4" />
          Redo the picks
        </Button>
      </ActionBar>
    </Shell>
  );
}
