"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepperProps {
  value: number;
  /** Called with +1 or -1; the caller owns clamping and removal semantics. */
  onStep: (delta: 1 | -1) => void;
  /** Accessible name for what's being counted, e.g. "people" or a dish name. */
  label: string;
  size?: "sm" | "md";
  shape?: "rounded" | "pill";
  className?: string;
}

/**
 * The one quantity control used across the app — guest counts, diet
 * headcounts, cart quantities — so they all look and behave identically.
 */
export function Stepper({
  value,
  onStep,
  label,
  size = "md",
  shape = "rounded",
  className,
}: StepperProps) {
  const sm = size === "sm";
  const radius = shape === "pill" ? "rounded-full" : "rounded-xl";
  const btnRadius = shape === "pill" ? "rounded-full" : "rounded-lg";

  return (
    <div
      className={cn(
        "flex items-center gap-1 glass-input border border-white/60 px-1",
        sm ? "h-10" : "h-12",
        radius,
        className
      )}
    >
      <button
        type="button"
        aria-label={`Fewer ${label}`}
        onClick={() => onStep(-1)}
        className={cn(
          "flex items-center justify-center text-ink-soft transition-colors hover:bg-parchment",
          sm ? "size-8" : "size-10",
          btnRadius
        )}
      >
        <Minus className={sm ? "size-3.5" : "size-4"} />
      </button>
      <span
        className={cn(
          "text-center font-semibold tabular-nums",
          sm ? "w-6 text-sm" : "w-10 text-lg"
        )}
      >
        {value}
      </span>
      <button
        type="button"
        aria-label={`More ${label}`}
        onClick={() => onStep(1)}
        className={cn(
          "flex items-center justify-center text-ink-soft transition-colors hover:bg-parchment",
          sm ? "size-8" : "size-10",
          btnRadius
        )}
      >
        <Plus className={sm ? "size-3.5" : "size-4"} />
      </button>
    </div>
  );
}
