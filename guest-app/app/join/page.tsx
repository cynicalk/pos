"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Users } from "lucide-react";
import { Shell, ActionBar } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFlow } from "@/hooks/use-flow";
import { useMenu } from "@/hooks/use-menu";
import { fetchTable, pushTable } from "@/lib/backend";
import { sessionVariant, sessionExplores } from "@/lib/experiment";
import groupsData from "@/data/groups.json";
import type {
  Allergen,
  CartItem,
  DietPreference,
  Member,
  TastePreference,
} from "@/types";

const schema = z.object({
  code: z
    .string()
    .trim()
    .min(4, "Enter the table code your group shared (e.g. AV-1234)"),
  name: z.string().min(2, "Tell us your name for the table"),
  phone: z.string().regex(/^\d{10}$/, "Enter your 10-digit mobile number"),
});

type FormValues = z.infer<typeof schema>;

export default function JoinTable() {
  const router = useRouter();
  const { patch } = useFlow();
  const { recommend } = useMenu();
  const [joining, setJoining] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setJoining(true);
    const code = values.code.toUpperCase().replace(/\s+/g, "");

    // Real join first: look the table up on the operator backend and land in
    // its LIVE shared cart. TableSync keeps both phones in step afterwards.
    const table = await fetchTable(code);
    if (table?.shared) {
      const me: Member = {
        id: `me-${Date.now()}`,
        name: values.name.trim(),
        isLeader: false,
        phone: values.phone,
        joinedVia: "device",
      };
      const members = [...(table.shared.members ?? []), me];
      const rev = (table.shared.rev ?? 0) + 1;

      // Announce ourselves to the table before navigating.
      await pushTable(table.visitId, {
        cart: table.shared.cart ?? [],
        members,
        groupType: table.shared.groupType ?? "friends",
        partySize: table.shared.partySize ?? members.length,
        rev,
      });

      patch({
        entryPath: "join",
        verified: true,
        guestName: values.name.trim(),
        phone: values.phone,
        tableCode: table.code,
        visitId: table.visitId,
        sharedRev: rev,
        partySize: table.shared.partySize ?? members.length,
        groupType: table.shared.groupType ?? "friends",
        members,
        membersConfirmed: true,
        prefMode: "per-person",
        cart: table.shared.cart ?? [],
        prefIntroSeen: true,
        autoJoined: true,
      });
      // Route through the loading screen so recommendations are computed
      // with the mined affinities it fetches.
      router.push("/loading");
      return;
    }

    // Offline / unknown code: the original simulated join keeps the demo
    // alive without a backend.

    // The host who opened the table, plus one friend already on their phone.
    const host = groupsData.joinableGuests[0];
    const friend = groupsData.joinableGuests[1];
    const members: Member[] = [
      {
        id: "leader",
        name: host.name,
        isLeader: true,
        diet: host.diet as DietPreference,
        tastes: host.tastes as TastePreference[],
        allergies: host.allergies as Allergen[],
        prefsComplete: true,
      },
      {
        id: `dev-${friend.name.toLowerCase()}`,
        name: friend.name,
        isLeader: false,
        diet: friend.diet as DietPreference,
        tastes: friend.tastes as TastePreference[],
        allergies: friend.allergies as Allergen[],
        prefsComplete: true,
        joinedVia: "device",
      },
      {
        id: `me-${Date.now()}`,
        name: values.name.trim(),
        isLeader: false,
        phone: values.phone,
        joinedVia: "device",
      },
    ];

    const partySize = 4;
    const groupType = "friends" as const;
    const recommendations = recommend({
      groupType,
      partySize,
      prefMode: "per-person",
      members,
      groupPrefs: {},
      refineTags: [],
      cart: [],
      variant: sessionVariant(),
      explore: sessionExplores(),
    });

    // Seed the shared cart with a couple of dishes the group already added,
    // so the joining guest lands on a cart that's clearly in progress.
    const cart: CartItem[] = recommendations.slice(0, 2).map((r, i) => ({
      dishId: r.dish.id,
      qty: 1,
      addedBy: i === 0 ? host.name : friend.name,
      source: "guest",
    }));

    setTimeout(() => {
      patch({
        entryPath: "join",
        verified: true,
        guestName: values.name.trim(),
        phone: values.phone,
        tableCode: code,
        partySize,
        groupType,
        members,
        membersConfirmed: true,
        prefMode: "per-person",
        recommendations,
        cart,
        // Skip the host-only interstitials and the one-off guest-join sim.
        prefIntroSeen: true,
        autoJoined: true,
        guestCartSimulated: true,
      });
      router.push("/recommendations");
    }, 700);
  };

  return (
    <Shell back="/" progress={12}>
      <div className="flex size-12 items-center justify-center rounded-2xl bg-plum/10 text-plum">
        <Users className="size-6" />
      </div>
      <h1 className="mt-5 font-display text-3xl font-semibold leading-tight">
        Join your table
      </h1>
      <p className="mt-2 text-stone">
        Enter the code your group shared and you&apos;re in their cart — no
        waiting, no re-ordering.
      </p>

      <form
        id="join-form"
        onSubmit={handleSubmit(onSubmit)}
        className="mt-8 space-y-6"
      >
        <Input
          label="Table code"
          placeholder="AV-1234"
          autoCapitalize="characters"
          autoComplete="off"
          className="tracking-[0.15em] uppercase"
          error={errors.code?.message}
          {...register("code")}
        />
        <Input
          label="Your name"
          placeholder="e.g. Aditi"
          autoComplete="name"
          error={errors.name?.message}
          {...register("name")}
        />
        <Input
          label="Phone number"
          type="tel"
          inputMode="numeric"
          maxLength={10}
          prefix="+91"
          placeholder="98765 43210"
          hint="So the table knows which dishes are yours"
          error={errors.phone?.message}
          {...register("phone")}
        />

        <p className="text-sm text-stone">
          Demo tip: any code works — try{" "}
          <span className="font-medium text-ink">AV-1234</span>
        </p>
      </form>

      <ActionBar>
        <Button
          type="submit"
          form="join-form"
          fullWidth
          size="lg"
          loading={joining}
        >
          {joining ? "Finding your table" : "Join the table"}
        </Button>
      </ActionBar>
    </Shell>
  );
}
