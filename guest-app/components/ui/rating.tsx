"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function Rating({
  value,
  onChange,
  size = "md",
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  size?: "sm" | "md";
  label?: string;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div
      className={cn("flex items-center gap-1", size === "md" && "justify-center gap-2")}
      role="radiogroup"
      aria-label={label ?? "Rating"}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= (hover || value);
        return (
          <motion.button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star > 1 ? "s" : ""}`}
            whileTap={{ scale: 0.85 }}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(star)}
            className={size === "md" ? "p-1" : "p-0.5"}
          >
            <Star
              className={cn(
                "transition-colors",
                size === "md" ? "size-9" : "size-7",
                active ? "fill-saffron text-saffron" : "text-ink/20"
              )}
            />
          </motion.button>
        );
      })}
    </div>
  );
}
