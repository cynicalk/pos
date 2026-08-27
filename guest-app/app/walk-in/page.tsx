"use client";

import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Shell, ActionBar } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stepper } from "@/components/ui/stepper";
import { useFlow } from "@/hooks/use-flow";
import { useGuard } from "@/hooks/use-guard";

const schema = z.object({
  name: z.string().min(2, "Tell us your name so we can greet you right"),
  phone: z.string().regex(/^\d{10}$/, "Enter your 10-digit mobile number"),
  partySize: z.number().min(1).max(20),
});

type FormValues = z.infer<typeof schema>;

export default function WalkInCapture() {
  const router = useRouter();
  const { patch, state } = useFlow();
  const ready = useGuard(state.entryPath === "walkin");

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { partySize: 2 },
  });

  if (!ready) return null;

  const onSubmit = (values: FormValues) => {
    patch({
      guestName: values.name.trim(),
      phone: values.phone,
      partySize: values.partySize,
    });
    router.push("/verify");
  };

  return (
    <Shell back="/" progress={12}>
      <h1 className="font-display text-3xl font-semibold leading-tight">
        Welcome in
      </h1>
      <p className="mt-2 text-stone">
        A few quick details and we&apos;ll get you to a table.
      </p>

      <form
        id="walkin-form"
        onSubmit={handleSubmit(onSubmit)}
        className="mt-8 space-y-6"
      >
        <Input
          label="Your name"
          placeholder="e.g. Priya Sharma"
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
          hint="We'll text you a one-time code"
          error={errors.phone?.message}
          {...register("phone")}
        />

        <Controller
          control={control}
          name="partySize"
          render={({ field }) => (
            <div>
              <p className="mb-1.5 text-sm font-medium text-ink-soft">
                How many of you?
              </p>
              <Stepper
                className="w-fit"
                value={field.value}
                label="people"
                onStep={(d) =>
                  field.onChange(Math.min(20, Math.max(1, field.value + d)))
                }
              />
            </div>
          )}
        />
      </form>

      <ActionBar>
        <Button type="submit" form="walkin-form" fullWidth size="lg">
          Send me the code
        </Button>
      </ActionBar>
    </Shell>
  );
}
