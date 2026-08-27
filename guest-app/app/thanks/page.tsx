"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFlow } from "@/hooks/use-flow";
import { useMenu } from "@/hooks/use-menu";

export default function ThankYou() {
  const router = useRouter();
  const { state, reset } = useFlow();
  const { restaurant: RESTAURANT } = useMenu();
  const given = Object.values(state.ratings).filter((v) => v > 0);
  const avgRating =
    given.length > 0 ? given.reduce((a, b) => a + b, 0) / given.length : 0;

  return (
    <div className="lux-dark flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className="flex size-20 items-center justify-center rounded-full border border-saffron/40 bg-white/5"
      >
        <Heart className="size-9 fill-saffron text-saffron" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <h1 className="mt-8 font-display text-3xl font-semibold">
          Thanks{state.guestName ? `, ${state.guestName.split(" ")[0]}` : ""}.
          Enjoy your meal.
        </h1>
        <p className="mx-auto mt-3 max-w-xs text-cream/80">
          {avgRating === 0
            ? "Your table's sorted — the kitchen takes it from here."
            : avgRating >= 4
              ? "Glad tonight worked. We'll remember your table for next time."
              : "We hear you — next visit will be smoother."}
        </p>
        <p className="editorial mt-10 text-cream/70">
          {RESTAURANT.name} · {RESTAURANT.location}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-10 w-full max-w-xs"
      >
        <Button
          variant="outline"
          fullWidth
          size="lg"
          className="border-cream/30 text-cream hover:border-cream/60 hover:bg-white/10"
          onClick={() => {
            reset();
            router.push("/");
          }}
        >
          Start a new table
        </Button>
      </motion.div>
    </div>
  );
}
