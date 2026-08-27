"use client";

import { useEffect, useRef } from "react";
import { useFlow } from "@/hooks/use-flow";
import {
  fetchTable,
  openTable,
  pushTable,
  type SharedTableDoc,
} from "@/lib/backend";

/**
 * Joined Cart sync. Mounted once inside FlowProvider; self-guarding, so it
 * costs nothing until a table is actually underway.
 *
 * - Leader: opens the table on the backend (using the join code already on
 *   screen) the first time the flow is verified. From then on, both roles
 *   behave identically:
 * - Push: cart/member changes upload after a short debounce, bumping `rev`.
 * - Pull: a poll adopts the server doc whenever its rev is newer — that's
 *   how one phone's adds appear on the other.
 *
 * Last write wins. Offline: every call is best-effort; the app remains the
 * standalone prototype it always was.
 */

const PUSH_DEBOUNCE_MS = 1200;
const POLL_INTERVAL_MS = 5000;

export default function TableSync() {
  const { state, patch } = useFlow();
  const opening = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The rev this device last wrote or adopted; ref so effects see it fresh.
  const knownRev = useRef(state.sharedRev);
  knownRev.current = state.sharedRev;

  const active =
    state.verified && state.partySize !== null && state.tableCode !== null;

  // ── Open the table (leader only — joiners arrive with a visitId) ──
  useEffect(() => {
    if (!active || state.visitId || state.entryPath === "join" || opening.current)
      return;
    opening.current = true;
    const doc: SharedTableDoc = {
      cart: state.cart,
      members: state.members,
      groupType: state.groupType,
      partySize: state.partySize,
      rev: 0,
    };
    openTable(doc, state.phone || undefined).then((table) => {
      opening.current = false;
      if (table) {
        // Server may have re-minted the code on a collision.
        patch({ visitId: table.visitId, tableCode: table.code, sharedRev: 0 });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, state.visitId, state.entryPath]);

  // ── Push local changes (debounced) ─────────────────────
  useEffect(() => {
    if (!state.visitId) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    const visitId = state.visitId;
    const doc: SharedTableDoc = {
      cart: state.cart,
      members: state.members,
      groupType: state.groupType,
      partySize: state.partySize,
      rev: knownRev.current + 1,
    };
    pushTimer.current = setTimeout(() => {
      pushTable(visitId, doc).then((ok) => {
        if (ok) patch({ sharedRev: doc.rev });
      });
    }, PUSH_DEBOUNCE_MS);
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.visitId, state.cart, state.members, state.groupType, state.partySize]);

  // ── Pull remote changes ────────────────────────────────
  useEffect(() => {
    if (!state.visitId || !state.tableCode) return;
    const code = state.tableCode;
    const timer = setInterval(async () => {
      const table = await fetchTable(code);
      if (!table?.shared) return;
      if ((table.shared.rev ?? 0) > knownRev.current) {
        patch({
          cart: table.shared.cart ?? [],
          members: table.shared.members ?? [],
          groupType: table.shared.groupType ?? null,
          partySize: table.shared.partySize ?? null,
          sharedRev: table.shared.rev ?? 0,
        });
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.visitId, state.tableCode]);

  return null;
}
