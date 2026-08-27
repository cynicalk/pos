"use client";

import { type ButtonHTMLAttributes } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

export function Chip({ selected, className, children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        // iOS-style filter pill: fill-based at rest, no border outline.
        "inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-all duration-150 active:scale-[0.97]",
        selected
          ? "border-saffron bg-saffron-soft/70 text-ink"
          : "border-transparent bg-fill text-ink-soft hover:bg-fill-strong hover:text-ink",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className
      )}
      {...props}
    >
      {selected && <Check className="size-3.5" />}
      {children}
    </button>
  );
}
