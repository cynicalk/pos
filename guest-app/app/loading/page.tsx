"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { LoadingChecklist } from "@/features/loading-checklist";
import { useFlow } from "@/hooks/use-flow";
import { useGuard } from "@/hooks/use-guard";
import { useMenu } from "@/hooks/use-menu";
import { setMinedAffinities } from "@/lib/recommend";
import { fetchMinedAffinities } from "@/lib/backend";
import { sessionVariant, sessionExplores } from "@/lib/experiment";

export default function AiLoading() {
  const router = useRouter();
  const { state, patch } = useFlow();
  const { recommend } = useMenu();
  const ready = useGuard(state.verified && state.partySize !== null);

  // Pull mined co-order affinities from the operator backend while the
  // checklist animates. Best-effort: on failure the engine keeps its seeded
  // fallback rules and the experience is unchanged.
  useEffect(() => {
    fetchMinedAffinities().then(setMinedAffinities);
  }, []);

  const finish = useCallback(() => {
    const recommendations = recommend({
      groupType: state.groupType,
      partySize: state.partySize,
      prefMode: state.prefMode,
      members: state.members,
      groupPrefs: state.groupPrefs,
      refineTags: state.refineTags,
      cart: state.cart,
      variant: sessionVariant(),
      explore: sessionExplores(),
    });
    patch({ recommendations });
    router.replace("/recommendations");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, router]);

  if (!ready) return null;

  return (
    <div className="lux-dark flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        className="mb-10 flex size-16 items-center justify-center rounded-full border border-saffron/40 bg-white/5 text-saffron"
      >
        <Sparkles className="size-7" />
      </motion.div>
      <h1 className="mb-2 text-center font-display text-3xl font-semibold">
        {state.refineRounds > 0 ? "Tuning your picks" : "Setting your table"}
      </h1>
      <p className="editorial mb-10 text-saffron/80">A moment, please</p>
      <LoadingChecklist quick={state.refineRounds > 0} onDone={finish} />
    </div>
  );
}
