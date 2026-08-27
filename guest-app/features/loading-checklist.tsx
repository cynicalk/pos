"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";

const FULL_STEPS = [
  "Understanding your group…",
  "Checking dietary preferences…",
  "Matching restaurant inventory…",
  "Finding trending dishes…",
  "Optimizing recommendations…",
];

// Regenerations already earned the "AI is thinking" moment once — repeat
// visits get a single fast pass instead of the full 3-second sequence.
const QUICK_STEPS = ["Rebalancing your picks…"];

export function LoadingChecklist({
  onDone,
  quick,
}: {
  onDone: () => void;
  quick?: boolean;
}) {
  const [completed, setCompleted] = useState(0);
  const STEPS = quick ? QUICK_STEPS : FULL_STEPS;

  useEffect(() => {
    const stepMs = quick ? 550 : 480;
    const timers = STEPS.map((_, i) =>
      setTimeout(() => setCompleted(i + 1), (i + 1) * stepMs)
    );
    const done = setTimeout(onDone, STEPS.length * stepMs + (quick ? 350 : 500));
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDone, quick]);

  return (
    <div className="mx-auto w-fit max-w-sm">
      <ul role="status" aria-live="polite" className="space-y-4">
        {STEPS.map((label, i) => {
          const isDone = i < completed;
          const isActive = i === completed;
          return (
            <motion.li
              key={label}
              initial={{ opacity: 0, x: -12 }}
              animate={{
                opacity: isDone || isActive ? 1 : 0.35,
                x: 0,
              }}
              transition={{ delay: i * 0.12 }}
              className="flex items-center gap-3"
            >
              <span aria-hidden className="flex size-6 items-center justify-center">
                <AnimatePresence mode="wait" initial={false}>
                  {isDone ? (
                    <motion.span
                      key="done"
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 22 }}
                      className="flex size-6 items-center justify-center rounded-full bg-sage text-cream"
                    >
                      <Check className="size-3.5" strokeWidth={3} />
                    </motion.span>
                  ) : isActive ? (
                    <motion.span key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <Loader2 className="size-5 animate-spin text-saffron" />
                    </motion.span>
                  ) : (
                    <span
                      key="idle"
                      className="size-5 rounded-full border border-cream/25"
                    />
                  )}
                </AnimatePresence>
              </span>
              <span
                className={`text-[15px] ${
                  isDone
                    ? "text-cream"
                    : isActive
                      ? "font-medium text-cream"
                      : "text-cream/40"
                }`}
              >
                {label}
              </span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
