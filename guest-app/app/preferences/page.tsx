"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { UtensilsCrossed } from "lucide-react";
import { useFlow } from "@/hooks/use-flow";
import { useGuard } from "@/hooks/use-guard";

/**
 * Short interstitial before table preferences. Guests who joined from the
 * shared link set their own preferences on their phones, so the host only
 * fills in the table-level picks next.
 */
export default function PreferencesIntro() {
  const router = useRouter();
  const { state, patch } = useFlow();
  const ready = useGuard(state.verified && state.partySize !== null);

  // Nice the first time, a toll on every revisit — skip straight through once seen.
  const skipIntro = state.prefIntroSeen;

  // Don't override a mode the user already picked (e.g. per-person).
  const mode = state.prefMode === "per-person" ? "per-person" : "leader-proxy";
  const target =
    mode === "per-person" ? "/preferences/per-person" : "/preferences/leader";

  const go = (markSeen: boolean) => {
    patch(markSeen ? { prefMode: mode, prefIntroSeen: true } : { prefMode: mode });
    router.replace(target);
  };

  useEffect(() => {
    if (!ready) return;
    if (skipIntro) {
      go(false);
      return;
    }
    // Short beat, then move on — also skippable with a tap (see onClick below).
    const timer = setTimeout(() => go(true), 1600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!ready || skipIntro) return null;

  return (
    <div
      onClick={() => go(true)}
      className="lux-dark flex min-h-dvh cursor-pointer flex-col items-center justify-center overflow-hidden px-6 text-center"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        className="mb-8 flex size-16 items-center justify-center rounded-full border border-saffron/40 bg-white/5 text-saffron"
      >
        <UtensilsCrossed className="size-7" />
      </motion.div>
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="max-w-xs font-display text-2xl font-semibold leading-snug"
      >
        A minute now means dishes everyone actually enjoys.
      </motion.p>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8 h-1 w-32 overflow-hidden rounded-full bg-white/10"
      >
        <motion.div
          className="h-full rounded-full bg-saffron"
          initial={{ x: "-100%" }}
          animate={{ x: "0%" }}
          transition={{ duration: 1.4, ease: "easeInOut" }}
        />
      </motion.div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="editorial mt-6 text-white/50"
      >
        Tap to continue
      </motion.p>
    </div>
  );
}
