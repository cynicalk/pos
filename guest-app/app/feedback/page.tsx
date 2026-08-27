"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shell, ActionBar } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Rating } from "@/components/ui/rating";
import { useFlow } from "@/hooks/use-flow";
import { useGuard } from "@/hooks/use-guard";
import { submitFeedback, type FeedbackResult } from "@/lib/backend";

const ASPECTS = [
  {
    key: "recommendations" as const,
    title: "The recommendations",
    hint: "Did our picks fit your table?",
  },
  {
    key: "app" as const,
    title: "The app experience",
    hint: "Getting seated, set up and ordering",
  },
  {
    key: "ordering" as const,
    title: "Ease of ordering",
    hint: "From picking dishes to placing the order",
  },
];

export default function Feedback() {
  const router = useRouter();
  const { state, patch } = useFlow();
  const ready = useGuard(!!state.orderNumber, "/members");
  const [ratings, setRatings] = useState(state.ratings);
  const [note, setNote] = useState(state.feedbackNote);
  const [sending, setSending] = useState(false);
  // Set once the backend has the feedback and told us how to route it.
  const [result, setResult] = useState<FeedbackResult | null>(null);

  if (!ready) return null;

  const rated = Object.values(ratings).some((v) => v > 0);

  const submit = async () => {
    if (sending) return;
    setSending(true);
    patch({ ratings, feedbackNote: note.trim() });

    // Only send the aspects the guest actually rated.
    const aspects = Object.fromEntries(
      Object.entries(ratings).filter(([, v]) => v > 0),
    );
    const res = await submitFeedback(
      aspects,
      note.trim(),
      state.orderNumber ?? undefined,
    );
    setSending(false);

    // Happy + the outlet has a public page → offer the review CTA. Otherwise
    // (unhappy, no URL configured, or unreachable) just thank them privately.
    if (res?.routePublic && res.reviewUrl) setResult(res);
    else router.push("/thanks");
  };

  // Happy guest, and the outlet has a public page — invite them out. We only
  // ever ask; nobody is blocked from reviewing wherever they like.
  if (result?.reviewUrl) {
    return (
      <Shell progress={100}>
        <div className="flex min-h-[60dvh] flex-col items-center justify-center text-center">
          <span className="text-5xl" aria-hidden>
            🌟
          </span>
          <h1 className="mt-6 font-display text-3xl font-semibold leading-tight">
            That&apos;s lovely to hear
          </h1>
          <p className="mt-3 max-w-xs text-stone">
            Would you tell others? It takes a moment and genuinely helps a small
            kitchen.
          </p>
          <div className="mt-8 w-full max-w-xs">
            <Button
              fullWidth
              size="lg"
              onClick={() => {
                window.open(
                  result.reviewUrl as string,
                  "_blank",
                  "noopener,noreferrer",
                );
                router.push("/thanks");
              }}
            >
              Leave a public review
            </Button>
            <Button
              fullWidth
              size="lg"
              variant="ghost"
              className="mt-2"
              onClick={() => router.push("/thanks")}
            >
              No thanks
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell progress={97}>
      <h1 className="font-display text-3xl font-semibold leading-tight">
        How was ordering tonight?
      </h1>
      <p className="mt-2 text-stone">
        A minute of honesty makes next time better — we&apos;ll ask about the
        food once it&apos;s on the table.
      </p>

      <div className="mt-8 space-y-3">
        {ASPECTS.map((aspect) => (
          <Card key={aspect.key} className="p-4">
            <p className="font-medium">{aspect.title}</p>
            <p className="text-sm text-stone">{aspect.hint}</p>
            <div className="mt-3">
              <Rating
                size="sm"
                label={aspect.title}
                value={ratings[aspect.key]}
                onChange={(v) => setRatings((r) => ({ ...r, [aspect.key]: v }))}
              />
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-8">
        <label
          htmlFor="feedback-note"
          className="mb-1.5 block text-sm font-medium text-ink-soft"
        >
          How well did the recommendations match what your table wanted?{" "}
          <span className="text-stone">(optional)</span>
        </label>
        <textarea
          id="feedback-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="Spot on? Too spicy? Missed someone's taste? Tell us…"
          className="w-full resize-none rounded-xl glass-input border border-white/60 p-4 text-base outline-none transition-colors placeholder:text-stone/70 focus:border-ember focus:ring-2 focus:ring-ember/15"
        />
      </div>

      {!rated && (
        <p className="mt-4 text-center text-xs text-stone">
          Tap a star on any card to send your feedback.
        </p>
      )}

      <ActionBar>
        <Button
          variant="ghost"
          size="lg"
          onClick={() => router.push("/thanks")}
        >
          Skip
        </Button>
        <Button
          fullWidth
          size="lg"
          onClick={submit}
          disabled={!rated || sending}
        >
          {sending ? "Sending…" : "Send feedback"}
        </Button>
      </ActionBar>
    </Shell>
  );
}
