"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { SearchX } from "lucide-react";
import { Shell, ActionBar } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFlow } from "@/hooks/use-flow";
import { useGuard } from "@/hooks/use-guard";
import groupsData from "@/data/groups.json";

const schema = z.object({
  name: z.string().min(2, "Tell us your name so we can find the booking"),
  phone: z
    .string()
    .transform((val) => val.replace(/\D/g, ""))
    .pipe(
      z
        .string()
        .regex(/^\d{10}$/, "Enter the 10-digit number used for the booking")
    ),
});

type FormValues = z.infer<typeof schema>;

export default function ReservationCapture() {
  const router = useRouter();
  const { patch, state } = useFlow();
  const ready = useGuard(state.entryPath === "reservation");
  const [notFound, setNotFound] = useState<"none" | "wrong-number" | null>(null);
  const [checking, setChecking] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  if (!ready) return null;

  const onSubmit = (values: FormValues) => {
    setNotFound(null);
    setChecking(true);
    // Mocked lookup against the restaurant's booking book. The phone number
    // is the key — the OTP goes there, so a name match alone isn't enough.
    setTimeout(() => {
      const booking = groupsData.reservations.find(
        (r) => r.phone === values.phone
      );
      setChecking(false);
      if (!booking) {
        const nameMatch = groupsData.reservations.some(
          (r) => r.name.toLowerCase() === values.name.trim().toLowerCase()
        );
        setNotFound(nameMatch ? "wrong-number" : "none");
        return;
      }
      // The booking already knows the table size — don't re-ask.
      patch({
        guestName: values.name,
        phone: values.phone,
        partySize: booking.partySize,
      });
      router.push("/verify");
    }, 700);
  };

  return (
    <Shell back="/" progress={12}>
      <h1 className="font-display text-3xl font-semibold leading-tight">
        Find your reservation
      </h1>
      <p className="mt-2 text-stone">
        A few details and your table&apos;s ready before you are.
      </p>

      <form
        id="reservation-form"
        onSubmit={handleSubmit(onSubmit)}
        className="mt-8 space-y-6"
      >
        <Input
          label="Name on the booking"
          placeholder="e.g. Priya Sharma"
          autoComplete="name"
          error={errors.name?.message}
          {...register("name")}
        />
        <Input
          label="Phone number"
          type="tel"
          inputMode="numeric"
          maxLength={11}
          prefix="+91"
          placeholder="98765 43210"
          error={errors.phone?.message}
          {...register("phone")}
        />

        <p className="text-sm text-stone">
          Your table size comes straight from the booking — nothing else to
          fill in.
        </p>

        {notFound && (
          <div className="flex items-start gap-3 rounded-card border border-danger/25 bg-danger-soft px-4 py-3">
            <SearchX className="mt-0.5 size-5 shrink-0 text-danger" />
            <div className="text-sm leading-relaxed">
              <p className="font-semibold text-danger">Reservation not found</p>
              <p className="text-ink-soft">
                {notFound === "wrong-number"
                  ? "There's a booking under that name, but with a different phone number — we can only send the code to the number on the booking. "
                  : "We couldn't find a booking under that phone number — it's what the booking is filed under, so double-check it first. "}
                Or{" "}
                <button
                  type="button"
                  className="font-semibold text-ember underline-offset-2 hover:underline"
                  onClick={() => {
                    patch({ entryPath: "walkin" });
                    router.push("/walk-in");
                  }}
                >
                  check in as a walk-in
                </button>
                .
              </p>
            </div>
          </div>
        )}

        <p className="text-sm text-stone">
          Demo tip: try{" "}
          <span className="font-medium text-ink">Priya Sharma</span> ·{" "}
          <span className="font-medium text-ink">98765 43210</span>
        </p>
      </form>

      <ActionBar>
        <Button
          type="submit"
          form="reservation-form"
          fullWidth
          size="lg"
          loading={checking}
        >
          {checking ? "Checking the book" : "Verify my booking"}
        </Button>
      </ActionBar>
    </Shell>
  );
}
