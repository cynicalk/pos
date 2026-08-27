import { cn } from "@/lib/utils";
import type { Dish } from "@/types";

/**
 * Moody "plated in candlelight" tile: deep navy ground with a warm,
 * tone-keyed glow behind the dish — the same dark treatment as the hero.
 */
const toneGlows: Record<Dish["tone"], string> = {
  ember: "bg-[radial-gradient(70%_70%_at_32%_28%,rgb(194_112_63/0.55),transparent_72%)]",
  saffron: "bg-[radial-gradient(70%_70%_at_32%_28%,rgb(201_150_46/0.5),transparent_72%)]",
  sage: "bg-[radial-gradient(70%_70%_at_32%_28%,rgb(111_143_92/0.5),transparent_72%)]",
  plum: "bg-[radial-gradient(70%_70%_at_32%_28%,rgb(150_74_92/0.55),transparent_72%)]",
  sand: "bg-[radial-gradient(70%_70%_at_32%_28%,rgb(176_154_109/0.5),transparent_72%)]",
};

export function DishTile({
  dish,
  size = "md",
}: {
  dish: Dish;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#131c30] shadow-lift ring-1 ring-white/10",
        size === "sm" && "size-12 text-[26px]",
        size === "md" && "size-16 text-4xl",
        size === "lg" && "size-20 text-5xl"
      )}
    >
      <span className={cn("absolute inset-0", toneGlows[dish.tone])} />
      <span className="absolute inset-0 bg-[radial-gradient(90%_90%_at_50%_115%,rgb(4_7_14/0.55),transparent_60%)]" />
      <span className="relative drop-shadow-[0_4px_8px_rgb(0_0_0/0.45)]">
        {dish.emoji}
      </span>
    </div>
  );
}
