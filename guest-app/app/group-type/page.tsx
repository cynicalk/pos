"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Shell, ActionBar } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useFlow } from "@/hooks/use-flow";
import { useGuard } from "@/hooks/use-guard";
import groupsData from "@/data/groups.json";
import type { GroupType } from "@/types";

export default function GroupTypeScreen() {
  const router = useRouter();
  const { state, patch } = useFlow();
  const ready = useGuard(state.verified && state.partySize !== null);

  // Reservation guests already told us — never re-ask.
  useEffect(() => {
    if (ready && state.groupType) router.replace("/preferences");
  }, [ready, state.groupType, router]);

  if (!ready || state.groupType) return null;

  const choose = (id: GroupType) => {
    patch({ groupType: id });
    router.push("/preferences");
  };

  return (
    <Shell back="/members" progress={58}>
      <h1 className="font-display text-3xl font-semibold leading-tight">
        What kind of night is it?
      </h1>
      <p className="mt-2 text-stone">
        This shapes what we put in front of you.
      </p>

      <div className="mt-8 space-y-3">
        {groupsData.groupTypes.map((g, i) => (
          <motion.div
            key={g.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <Card
              interactive
              onClick={() => choose(g.id as GroupType)}
              className="flex items-center gap-4 p-4"
            >
              <span
                aria-hidden
                className="flex size-12 items-center justify-center rounded-2xl bg-parchment text-2xl"
              >
                {g.emoji}
              </span>
              <div>
                <p className="font-display text-lg font-semibold">{g.label}</p>
                <p className="text-sm text-stone">{g.description}</p>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <ActionBar>
        <Button
          variant="ghost"
          size="lg"
          fullWidth
          onClick={() => router.push("/preferences")}
        >
          Not sure — skip this
        </Button>
      </ActionBar>
    </Shell>
  );
}
