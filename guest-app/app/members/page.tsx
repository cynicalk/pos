"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  History,
  Phone,
  Plus,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Shell, ActionBar } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MemberAvatar } from "@/features/member-card";
import { useFlow } from "@/hooks/use-flow";
import { useGuard } from "@/hooks/use-guard";
import { useToast } from "@/components/ui/toast";
import groupsData from "@/data/groups.json";
import type { Allergen, DietPreference, TastePreference } from "@/types";

export default function AddMembers() {
  const router = useRouter();
  const toast = useToast();
  const { state, upsertMember, removeMember, patch } = useFlow();
  const ready = useGuard(state.verified && state.partySize !== null);
  const [name, setName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  // Keep the page short once people are in: collapse the QR after the first
  // guest joins, but let the host toggle it either way (null = automatic).
  const [qrOpen, setQrOpen] = useState<boolean | null>(null);

  const tableCode = useMemo(
    () =>
      state.tableCode ??
      `AV-${String(Math.floor(1000 + Math.random() * 9000))}`,
    [state.tableCode]
  );

  const guests = state.members.filter((m) => !m.isLeader);
  const nextRoute = state.groupType ? "/preferences" : "/group-type";
  const isSolo = state.partySize === 1;
  const tableFull =
    state.partySize !== null && state.members.length >= state.partySize;

  // Persist the generated table code so the QR/link stay stable.
  useEffect(() => {
    if (ready && !state.tableCode) patch({ tableCode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Demo aliveness: the table code is always on screen now, so one guest
  // "finds" it and pops into the list a couple of seconds after load.
  useEffect(() => {
    if (!ready || state.autoJoined) return;
    if (state.partySize !== null && state.members.length >= state.partySize) return;
    const existing = new Set(state.members.map((m) => m.name.toLowerCase()));
    const guest = groupsData.joinableGuests.find(
      (g) => !existing.has(g.name.toLowerCase())
    );
    if (!guest) return;
    const timer = setTimeout(() => {
      upsertMember({
        id: `dev-${guest.name.toLowerCase()}`,
        name: guest.name,
        isLeader: false,
        diet: guest.diet as DietPreference,
        tastes: guest.tastes as TastePreference[],
        allergies: guest.allergies as Allergen[],
        prefsComplete: true,
        joinedVia: "device",
      });
      patch({ autoJoined: true });
      toast(`${guest.name} joined from their phone`, "success");
    }, 2400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, state.autoJoined]);

  if (!ready) return null;

  const addGuest = (guestName: string, diet?: DietPreference, phone?: string) => {
    const trimmed = guestName.trim();
    if (!trimmed) return;
    upsertMember({
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: trimmed,
      isLeader: false,
      diet,
      phone: phone?.trim() || undefined,
    });
  };

  const addLastGroup = () => {
    // Skip anyone already at the table (e.g. joined from their phone) and
    // never add past the table's seat count.
    const existing = new Set(state.members.map((m) => m.name.toLowerCase()));
    let seats =
      state.partySize === null
        ? Infinity
        : Math.max(0, state.partySize - state.members.length);
    let added = 0;
    for (const g of groupsData.lastGroup.members) {
      if (seats > 0 && !existing.has(g.name.toLowerCase())) {
        addGuest(g.name, g.diet as DietPreference);
        seats -= 1;
        added += 1;
      }
    }
    toast(
      added > 0
        ? `Added your group from ${groupsData.lastGroup.label}`
        : "Your table is already full",
      added > 0 ? "success" : "info"
    );
  };

  const inviteLink = `https://cooklyt.app/join/${tableCode}`;

  const copyInvite = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(inviteLink).catch(() => {});
    toast("Invite link copied", "success");
  };

  // One tap: native share sheet where available, copy as the fallback.
  const shareInvite = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join our table on Cooklyt",
          text: `Join our table (code ${tableCode}) — set your preferences and add dishes to our shared cart.`,
          url: inviteLink,
        });
        return;
      } catch {
        /* user dismissed the sheet — fall through to copy */
      }
    }
    copyInvite();
  };

  const proceed = () => {
    patch({ membersConfirmed: true });
    router.push(nextRoute);
  };

  const hostAddedGuests = guests.filter((m) => m.joinedVia !== "device");
  // Collapsed by default — the code + share button carry the card; the QR
  // is one tap away for tables that want it.
  const showQr = qrOpen ?? false;

  const isReservation = state.entryPath === "reservation";
  const groupType = groupsData.groupTypes.find((g) => g.id === state.groupType);
  const firstName = state.guestName ? state.guestName.split(" ")[0] : "";

  return (
    <Shell>
      <h1 className="font-display text-3xl font-semibold leading-tight">
        {firstName
          ? `Welcome, ${firstName}.`
          : isSolo
            ? "You're all set."
            : "Who's at the table?"}
      </h1>
      <p className="mt-2 text-sm text-stone">
        {isReservation ? "Reservation confirmed" : "You're checked in"} · Table
        for {state.partySize}
        {groupType && (
          <>
            {` · ${groupType.label} `}
            <span aria-hidden>{groupType.emoji}</span>
          </>
        )}
      </p>

      {isSolo && (
        <p className="mt-6 text-[15px] leading-relaxed text-ink-soft">
          A table for one, done right — we&apos;ll tailor tonight&apos;s picks
          just to you. Next, tell us what you&apos;re in the mood for.
        </p>
      )}

      {!isSolo && (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="mt-6 p-5">
          <h2 className="font-display text-lg font-semibold">
            <span aria-hidden className="mr-1.5 text-saffron">
              1 ·
            </span>
            Invite them to join
          </h2>
          <div className="mt-3 text-center">
            <p className="font-display text-4xl font-semibold tracking-[0.2em]">
              {tableCode}
            </p>
            <p className="mt-2 text-sm text-stone">
              Guests join at{" "}
              <span className="font-medium text-ink">cooklyt.app/join</span> to
              pick their own dishes.
            </p>
            <Button className="mt-4" onClick={shareInvite}>
              <Share2 className="size-4" />
              Share invite
            </Button>
            {showQr && (
              <>
                <div className="mx-auto mt-4 w-fit rounded-2xl border border-ink/10 bg-white p-3">
                  <QRCodeSVG value={inviteLink} size={132} marginSize={0} />
                </div>
                <p className="mt-2 text-xs text-stone">
                  Or scan to join — no typing needed
                </p>
              </>
            )}
            <button
              onClick={() => setQrOpen(!showQr)}
              className="mt-3 block w-full text-center text-sm font-medium text-ink-soft underline-offset-4 hover:underline"
            >
              {showQr ? "Hide QR code" : "Show QR code"}
            </button>
          </div>
        </Card>
      </motion.div>
      )}

      {!isSolo && (
      <Card className="mt-4 p-5">
        <h2 className="font-display text-lg font-semibold">
          <span aria-hidden className="mr-1.5 text-saffron">
            2 ·
          </span>
          Or add them yourself
        </h2>
        {hostAddedGuests.length === 0 && (
            <button
              onClick={addLastGroup}
              className="mt-3 flex w-full items-center gap-3 rounded-card border border-ember/30 bg-ember-soft p-4 text-left transition-all hover:shadow-lift"
            >
              <History className="size-5 shrink-0 text-ember" />
              <span className="flex-1">
                <span className="block font-medium">Same group as last time</span>
                <span className="block text-sm text-ink-soft">
                  {groupsData.lastGroup.members.map((m) => m.name).join(", ")} ·{" "}
                  {groupsData.lastGroup.label}
                </span>
              </span>
              <Plus className="size-5 shrink-0 text-ember" />
            </button>
          )}

          <form
            className="mt-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (tableFull) {
                toast(
                  `Your table's set for ${state.partySize} — update the size to add more`,
                  "info"
                );
                return;
              }
              addGuest(name, undefined, guestPhone);
              if (guestPhone.length === 10) {
                toast(`Invite texted to +91 ${guestPhone}`, "success");
              }
              setName("");
              setGuestPhone("");
            }}
          >
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Guest's name"
                aria-label="Guest's name"
                disabled={tableFull}
                className="h-12 min-w-0 flex-1 rounded-xl glass-input border border-white/60 px-4 text-base outline-none transition-colors placeholder:text-stone/70 focus:border-ember focus:ring-2 focus:ring-ember/15 disabled:opacity-50"
              />
              <Button
                type="submit"
                variant="secondary"
                disabled={!name.trim() || tableFull}
              >
                <Plus className="size-4" />
                Add
              </Button>
            </div>
            <input
              value={guestPhone}
              onChange={(e) =>
                setGuestPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              type="tel"
              inputMode="numeric"
              placeholder="Phone number (optional)"
              aria-label="Guest's phone number"
              className="h-10 w-full rounded-xl glass-input border border-white/60 px-4 text-sm outline-none transition-colors placeholder:text-stone/70 focus:border-ember focus:ring-2 focus:ring-ember/15"
            />
            {tableFull ? (
              <p className="text-xs text-stone">
                Your table&apos;s full at {state.partySize}. Remove someone to
                add a different guest.
              </p>
            ) : (
              guestPhone.length > 0 && (
                <p className="text-xs text-stone">
                  We&apos;ll text them the invite link so they can set their own
                  preferences.
                </p>
              )
            )}
          </form>
      </Card>
      )}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone">
          At the table
          {state.partySize !== null &&
            ` · ${state.members.length} of ${state.partySize}`}
        </h2>
        {state.partySize !== null && state.members.length < state.partySize && (
          <p className="flex items-center gap-2 text-xs text-stone">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-sage opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-sage" />
            </span>
            Waiting for guests…
          </p>
        )}
      </div>

      <div className="mt-3 space-y-2.5">
        <AnimatePresence initial={false}>
        {state.members.map((m, i) => (
          <motion.div
            key={m.id}
            layout
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          >
          <Card className="flex items-center gap-3 p-3.5">
            <MemberAvatar name={m.name} index={i} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {m.name}
                {m.isLeader && (
                  <span className="ml-2 rounded-full bg-parchment px-2 py-0.5 text-xs text-ink-soft">
                    You
                  </span>
                )}
              </p>
              {m.phone && !m.joinedVia && (
                <p className="flex items-center gap-1 text-xs text-stone">
                  <Phone className="size-3" />
                  +91 {m.phone}
                </p>
              )}
              {m.joinedVia === "device" && (
                <p className="flex items-center gap-1 text-xs text-sage">
                  <Check className="size-3" />
                  Joined on their phone · preferences set
                </p>
              )}
            </div>
            {!m.isLeader && (
              <button
                aria-label={`Remove ${m.name}`}
                onClick={() => {
                  removeMember(m.id);
                  toast(`${m.name} removed`, "info", {
                    label: "Undo",
                    onClick: () => upsertMember(m),
                  });
                }}
                className="rounded-full p-2 text-stone transition-colors hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </Card>
          </motion.div>
        ))}
        </AnimatePresence>
        {guests.length === 0 && !isSolo && (
          <EmptyState
            icon={<Users className="size-5" />}
            title="Just you so far"
            description="Add the others, share the code, or skip and order for the table yourself."
          />
        )}
      </div>

      <button
        onClick={() => router.push("/menu?browse=1")}
        className="editorial mt-6 w-full text-center text-stone underline-offset-4 transition-colors hover:text-ink hover:underline"
      >
        Prefer to browse? See the full menu
      </button>

      <ActionBar>
        <Button fullWidth size="lg" onClick={proceed}>
          {nextRoute === "/preferences" ? "Continue to preferences" : "Continue"}
        </Button>
      </ActionBar>
    </Shell>
  );
}
