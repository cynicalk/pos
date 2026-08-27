"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFlow } from "@/hooks/use-flow";

/**
 * Redirects when a screen's prerequisites aren't met (e.g. deep-linking past
 * OTP). Returns false until session state has hydrated so screens can hold
 * rendering instead of flashing wrong content.
 */
export function useGuard(ok: boolean, redirect = "/") {
  const { hydrated } = useFlow();
  const router = useRouter();
  // Latch once satisfied: a screen that was legitimately entered must not
  // bounce the user when it mutates the very state it guards on (e.g. the
  // leader-proxy screen switching prefMode to per-person mid-navigation).
  const everOk = useRef(false);
  if (ok) everOk.current = true;

  useEffect(() => {
    if (hydrated && !ok && !everOk.current) router.replace(redirect);
  }, [hydrated, ok, redirect, router]);

  return hydrated && (ok || everOk.current);
}
