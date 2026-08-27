"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  CalendarCheck,
  ChevronRight,
  Footprints,
  Sparkles,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { LangToggle } from "@/components/lang-toggle";
import { useFlow } from "@/hooks/use-flow";
import { useLang } from "@/hooks/use-lang";
import { useMenu } from "@/hooks/use-menu";

export default function Landing() {
  const router = useRouter();
  const { reset, patch } = useFlow();
  const { restaurant: RESTAURANT } = useMenu();
  const { t } = useLang();

  const choose = (path: "reservation" | "walkin") => {
    reset();
    patch({ entryPath: path });
    router.push(path === "reservation" ? "/reservation" : "/walk-in");
  };

  const joinTable = () => {
    reset();
    router.push("/join");
  };

  return (
    <main className="flex min-h-dvh flex-col">
      <div className="lux-dark overflow-hidden pb-24 pt-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-saffron/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 size-72 rounded-full bg-plum/25 blur-3xl"
        />
        <div aria-hidden className="lux-feather" />
        <div className="relative mx-auto w-full max-w-lg px-6">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex items-center justify-between">
              <p className="editorial inline-flex items-center gap-1.5 text-white/60">
                <Sparkles className="size-3 text-saffron" />
                {t("landing.poweredBy")}
              </p>
              <LangToggle className="text-white/80" />
            </div>
            <h1 className="mt-5 font-display text-4xl font-semibold leading-tight sm:text-5xl">
              {RESTAURANT.name}
            </h1>
            <p className="editorial mt-3 text-saffron/90">
              {RESTAURANT.tagline}
            </p>
            <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-white/85">
              {t("landing.blurb")}
            </p>
          </motion.div>
        </div>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-lg flex-1 px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="-mt-8 space-y-3"
        >
          <Card
            interactive
            onClick={() => choose("reservation")}
            className="flex items-center gap-4 p-5"
          >
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-ember-soft">
              <CalendarCheck className="size-6 text-ember" />
            </div>
            <div className="flex-1">
              <h2 className="font-display text-lg font-semibold">
                {t("landing.reservation")}
              </h2>
              <p className="text-sm text-stone">
                {t("landing.reservationSub")}
              </p>
            </div>
            <ChevronRight className="size-5 text-stone" />
          </Card>

          <Card
            interactive
            onClick={() => choose("walkin")}
            className="flex items-center gap-4 p-5"
          >
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-saffron-soft">
              <Footprints className="size-6 text-saffron" />
            </div>
            <div className="flex-1">
              <h2 className="font-display text-lg font-semibold">
                {t("landing.walkin")}
              </h2>
              <p className="text-sm text-stone">{t("landing.walkinSub")}</p>
            </div>
            <ChevronRight className="size-5 text-stone" />
          </Card>

          <Card
            interactive
            onClick={joinTable}
            className="flex items-center gap-4 p-5"
          >
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-plum/10">
              <Users className="size-6 text-plum" />
            </div>
            <div className="flex-1">
              <h2 className="font-display text-lg font-semibold">
                {t("landing.join")}
              </h2>
              <p className="text-sm text-stone">{t("landing.joinSub")}</p>
            </div>
            <ChevronRight className="size-5 text-stone" />
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="editorial mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-4 text-center text-stone"
        >
          <span className="flex items-center gap-1 whitespace-nowrap text-ink-soft">
            <Sparkles className="size-3 text-saffron" />
            {t("landing.tagline")}
          </span>
        </motion.div>

        <p className="mt-10 pb-10 text-center text-xs text-stone">
          {RESTAURANT.location}
        </p>
      </div>
    </main>
  );
}
