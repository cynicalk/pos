"use client";

import { MotionConfig, motion } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { FLOW_STEPS, stepIndexForPath } from "@/hooks/use-flow";
import { trackFunnelStep } from "@/lib/analytics";

/**
 * Route transition: every flow step slides in instead of hard-cutting.
 * MotionConfig honours the OS-level prefers-reduced-motion setting for
 * every Framer Motion animation in the app.
 *
 * Templates remount on every navigation, so this doubles as the funnel probe:
 * one page view emits exactly one `funnel_step` event.
 */
export default function Template({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const i = stepIndexForPath(pathname);
    if (i >= 0) {
      trackFunnelStep(FLOW_STEPS[i].id, FLOW_STEPS[i].label, pathname);
    } else if (pathname === "/") {
      trackFunnelStep("landing", "Landing", pathname);
    }
  }, [pathname]);

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
