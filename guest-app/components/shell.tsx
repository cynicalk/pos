"use client";

import { type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { FLOW_STEPS, stepIndexForPath } from "@/hooks/use-flow";
import { useMenu } from "@/hooks/use-menu";

function StepProgress({ pathname }: { pathname: string }) {
  const current = stepIndexForPath(pathname);
  if (current < 0) return null;
  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-2.5">
      <div className="flex gap-1.5">
        {FLOW_STEPS.map((step, i) => (
          <motion.span
            key={step.id}
            layout
            className={`h-px flex-1 ${
              i <= current ? "bg-saffron/90" : "bg-white/20"
            }`}
            initial={{ scaleX: 0.6, opacity: 0.4 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex">
        {FLOW_STEPS.map((step, i) => (
          <span
            key={step.id}
            className={`editorial flex-1 text-center !text-[9px] ${
              i === current
                ? "text-saffron"
                : i < current
                  ? "text-white/65"
                  : "text-white/35"
            }`}
          >
            {step.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Shell({
  children,
  back,
  hideHeader,
  wide,
}: {
  children: ReactNode;
  /** Route to go back to; omit to hide the back button */
  back?: string;
  hideHeader?: boolean;
  wide?: boolean;
  /** @deprecated progress is now derived from the route's flow step */
  progress?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { restaurant } = useMenu();
  return (
    <div className="flex min-h-dvh flex-col">
      {!hideHeader && (
        <header className="hero-bar sticky top-0 z-30 text-white">
          <div
            className={`mx-auto flex h-14 w-full items-center gap-3 px-4 ${
              wide ? "max-w-3xl" : "max-w-lg"
            }`}
          >
            {back ? (
              <button
                onClick={() => router.push(back)}
                aria-label="Go back"
                className="-ml-2 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <ArrowLeft className="size-5" />
              </button>
            ) : (
              <span className="w-1" />
            )}
            <div className="min-w-0">
              <p className="font-display text-[15px] font-semibold leading-tight">
                {restaurant.name}
              </p>
              <p className="editorial truncate !text-[9px] text-white/45">
                Powered by Cooklyt
              </p>
            </div>
          </div>
          <StepProgress pathname={pathname} />
        </header>
      )}
      <main
        className={`mx-auto w-full flex-1 px-4 pb-36 pt-6 ${
          wide ? "max-w-3xl" : "max-w-lg"
        }`}
      >
        {children}
      </main>
    </div>
  );
}

/** Fixed bottom action bar that stays above the fold on mobile. */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="glass-bar fixed inset-x-0 bottom-0 z-30 border-t border-separator shadow-[0_-10px_30px_-14px_rgb(16_26_44/0.22)]">
      <div className="mx-auto flex w-full max-w-lg items-center gap-3 px-4 pb-[max(1.1rem,env(safe-area-inset-bottom))] pt-3.5">
        {children}
      </div>
    </div>
  );
}
