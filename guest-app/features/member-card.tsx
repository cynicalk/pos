"use client";

import { CheckCircle2, ChevronRight, Crown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DIET_LABELS, ALLERGEN_LABELS } from "@/lib/utils";
import type { Member } from "@/types";

const AVATAR_TONES = [
  "bg-ember-soft text-ember-deep",
  "bg-sage-soft text-sage",
  "bg-plum-soft text-plum",
  "bg-saffron-soft text-ink-soft",
  "bg-sand-soft text-ink-soft",
];

export function MemberAvatar({ name, index }: { name: string; index: number }) {
  return (
    <div
      className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
        AVATAR_TONES[index % AVATAR_TONES.length]
      }`}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function MemberCard({
  member,
  index,
  onClick,
  showStatus,
}: {
  member: Member;
  index: number;
  onClick?: () => void;
  showStatus?: boolean;
}) {
  const detail = [
    member.diet ? DIET_LABELS[member.diet] : null,
    member.allergies?.length
      ? `Allergic: ${member.allergies.map((a) => ALLERGEN_LABELS[a]).join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card
      interactive={!!onClick}
      onClick={onClick}
      className="flex items-center gap-3 p-3.5"
    >
      <MemberAvatar name={member.name} index={index} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-semibold">
          {member.name}
          {member.isLeader && (
            <Crown className="size-3.5 text-saffron" aria-label="Setting up the order" />
          )}
        </p>
        <p className="truncate text-sm text-stone">
          {detail || "No preferences added yet"}
        </p>
      </div>
      {showStatus &&
        (member.prefsComplete ? (
          <CheckCircle2 className="size-5 shrink-0 text-sage" />
        ) : (
          <ChevronRight className="size-5 shrink-0 text-stone" />
        ))}
    </Card>
  );
}
