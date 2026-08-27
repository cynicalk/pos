import { ShieldCheck } from "lucide-react";
import { ALLERGEN_LABELS } from "@/lib/utils";
import type { Allergen } from "@/types";

export function AllergyBanner({ allergens }: { allergens: Allergen[] }) {
  if (allergens.length === 0) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-sage/25 bg-sage-soft px-4 py-3">
      <ShieldCheck className="mt-0.5 size-5 shrink-0 text-sage" />
      <p className="text-sm text-ink-soft">
        <span className="font-semibold text-ink">Allergy filter on.</span>{" "}
        Everything shown is free of{" "}
        {allergens.map((a) => ALLERGEN_LABELS[a].toLowerCase()).join(", ")}.
      </p>
    </div>
  );
}
