"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Flame, Leaf } from "lucide-react";
import type { Dish } from "@/types";

// Bottom-sheet with the full transparency on a dish: what's in it, its
// allergens, spice, and per-serving nutrition. Nutrition is a backend ESTIMATE
// and is labelled as such — we never present it as exact, matching the app's
// "never fabricate a number" principle.

const SPICE_LABELS = ["Not spicy", "Mild", "Medium", "Hot"];

export function DishDetail({
  dish,
  onClose,
}: {
  dish: Dish | null;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {dish && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm"
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-label={`${dish.name} details`}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="glass fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl p-6 pb-8"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl" aria-hidden>
                  {dish.emoji}
                </span>
                <div>
                  <h2 className="font-display text-xl font-semibold">
                    {dish.name}
                  </h2>
                  <p className="text-sm text-stone">
                    {formatPrice(dish.price)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex size-8 items-center justify-center rounded-full bg-fill text-ink-soft"
              >
                <X className="size-4" />
              </button>
            </div>

            {dish.description && (
              <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
                {dish.description}
              </p>
            )}

            {/* Diet / spice chips */}
            <div className="mt-4 flex flex-wrap gap-2">
              {dish.tags.includes("veg") && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sage-soft px-2.5 py-1 text-xs font-medium text-sage">
                  <Leaf className="size-3" /> Veg
                </span>
              )}
              {typeof dishSpice(dish) === "number" && dishSpice(dish)! > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-ember-soft px-2.5 py-1 text-xs font-medium text-ember">
                  <Flame className="size-3" />{" "}
                  {SPICE_LABELS[dishSpice(dish)!] ?? "Spicy"}
                </span>
              )}
            </div>

            {/* Allergens — safety-critical, always shown (even when empty) */}
            <section className="mt-5">
              <h3 className="editorial mb-1.5 text-stone">Allergens</h3>
              {dish.allergens.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {dish.allergens.map((a) => (
                    <span
                      key={a}
                      className="rounded-full bg-danger-soft px-2.5 py-1 text-xs font-medium capitalize text-danger"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-soft">
                  None on file. Ask staff if unsure.
                </p>
              )}
            </section>

            {/* Ingredients */}
            {dish.ingredients && dish.ingredients.length > 0 && (
              <section className="mt-5">
                <h3 className="editorial mb-1.5 text-stone">
                  What&apos;s in it
                </h3>
                <p className="text-sm capitalize text-ink-soft">
                  {dish.ingredients.join(" · ")}
                </p>
              </section>
            )}

            {/* Nutrition — labelled as an estimate */}
            {dish.nutrition && (
              <section className="mt-5">
                <h3 className="editorial mb-1.5 text-stone">
                  Nutrition{" "}
                  <span className="normal-case text-stone/70">
                    · estimated per serving
                  </span>
                </h3>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <NutriCell label="kcal" value={dish.nutrition.calories} />
                  <NutriCell
                    label="protein"
                    value={dish.nutrition.protein}
                    unit="g"
                  />
                  <NutriCell
                    label="carbs"
                    value={dish.nutrition.carbs}
                    unit="g"
                  />
                  <NutriCell label="fat" value={dish.nutrition.fat} unit="g" />
                </div>
              </section>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function NutriCell({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null;
  unit?: string;
}) {
  return (
    <div className="rounded-xl bg-fill px-2 py-2.5">
      <p className="font-display text-lg font-semibold tabular-nums">
        {value == null ? "—" : value}
        {value != null && unit ? unit : ""}
      </p>
      <p className="editorial !text-[9px] text-stone">{label}</p>
    </div>
  );
}

function dishSpice(dish: Dish): number | null {
  if (typeof dish.spiceLevel === "number") return dish.spiceLevel;
  return dish.tags.includes("spicy") ? 2 : null;
}

function formatPrice(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
