"use client";

import { motion } from "framer-motion";
import { Minus, Plus, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DishTile } from "@/features/dish-tile";
import { formatPrice } from "@/lib/utils";
import type { Dish } from "@/types";

export function RecommendationCard({
  dish,
  reason,
  qty,
  onQtyChange,
  index = 0,
}: {
  dish: Dish;
  reason?: string;
  qty: number;
  onQtyChange: (qty: number) => void;
  index?: number;
}) {
  const isVeg = dish.tags.includes("veg");
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.35, ease: "easeOut" }}
    >
      <Card className="p-4">
        <div className="flex gap-4">
          <DishTile dish={dish} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span
                  aria-label={isVeg ? "Vegetarian" : "Non-vegetarian"}
                  className={`inline-block size-3 shrink-0 rounded-[3px] border-2 p-px ${
                    isVeg ? "border-sage" : "border-danger"
                  }`}
                >
                  <span
                    className={`block size-full rounded-full ${
                      isVeg ? "bg-sage" : "bg-danger"
                    }`}
                  />
                </span>
                <h3 className="truncate font-semibold leading-snug">{dish.name}</h3>
              </div>
              <span className="shrink-0 text-sm font-semibold">
                {formatPrice(dish.price)}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-stone">
              {dish.description}
            </p>
            {reason && (
              <p className="editorial mt-2.5 flex items-center gap-1.5 !text-[10px] text-saffron">
                <Sparkles className="size-3 shrink-0" />
                {reason}
              </p>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end border-t border-separator pt-3">
          {qty === 0 ? (
            <button
              onClick={() => onQtyChange(1)}
              className="h-9 rounded-full border border-ink/25 px-6 text-sm font-medium text-ink transition-colors hover:bg-ink hover:text-cream"
            >
              Add
            </button>
          ) : (
            <div className="flex h-9 items-center gap-1 rounded-full border border-ink/25 text-ink">
              <button
                aria-label={`Remove one ${dish.name}`}
                onClick={() => onQtyChange(qty - 1)}
                className="flex h-full w-9 items-center justify-center rounded-l-full hover:bg-ink/5"
              >
                <Minus className="size-4" />
              </button>
              <span className="w-5 text-center text-sm font-semibold">{qty}</span>
              <button
                aria-label={`Add one ${dish.name}`}
                onClick={() => onQtyChange(qty + 1)}
                className="flex h-full w-9 items-center justify-center rounded-r-full hover:bg-ink/5"
              >
                <Plus className="size-4" />
              </button>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
