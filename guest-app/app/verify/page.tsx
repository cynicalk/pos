"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell, ActionBar } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { useFlow } from "@/hooks/use-flow";
import { useGuard } from "@/hooks/use-guard";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export default function Verify() {
  const router = useRouter();
  const toast = useToast();
  const { state, patch, upsertMember } = useFlow();
  const ready = useGuard(!!state.phone && !!state.entryPath);

  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  if (!ready) return null;

  const code = digits.join("");
  const masked = `+91 ${state.phone.slice(0, 2)}××× ××${state.phone.slice(7)}`;

  const complete = (full: string) => {
    if (checking) return;
    setChecking(true);
    // Mocked verification — any 6-digit code passes after a short beat.
    setTimeout(() => {
      patch({ verified: true });
      upsertMember({
        id: "leader",
        name: state.guestName || "You",
        isLeader: true,
      });
      router.push(state.partySize === null ? "/party-size" : "/members");
    }, 700);
    void full;
  };

  const setDigit = (i: number, value: string) => {
    // SMS autofill often drops the whole code into one input.
    const filled = value.replace(/\D/g, "");
    if (filled.length === 6) {
      setDigits(filled.split(""));
      complete(filled);
      return;
    }
    const v = filled.slice(-1);
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    setError("");
    if (v && i < 5) inputs.current[i + 1]?.focus();
    if (v && next.every((d) => d)) complete(next.join(""));
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length === 6) {
      setDigits(text.split(""));
      inputs.current[5]?.focus();
      e.preventDefault();
      complete(text);
    }
  };

  const verify = () => {
    if (code.length < 6) {
      setError("Enter all six digits");
      return;
    }
    complete(code);
  };

  return (
    <Shell back={state.entryPath === "reservation" ? "/reservation" : "/walk-in"} progress={24}>
      <h1 className="font-display text-3xl font-semibold leading-tight">
        Enter the code
      </h1>
      <p className="mt-2 text-stone">
        We sent a 6-digit code to <span className="font-medium text-ink">{masked}</span>
      </p>

      <div className="mt-8 flex gap-2" onPaste={onPaste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            value={d}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            autoFocus={i === 0}
            aria-label={`Digit ${i + 1}`}
            className={cn(
              "h-14 w-full max-w-13 glass-input rounded-xl border text-center text-xl font-semibold outline-none transition-colors focus:border-ember focus:ring-2 focus:ring-ember/15",
              error ? "border-danger" : "border-white/60"
            )}
          />
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <button
        onClick={() => toast("Code resent to " + masked, "success")}
        className="mt-6 text-sm font-medium text-ink-soft underline-offset-4 hover:underline"
      >
        Didn&apos;t get it? Resend code
      </button>

      <ActionBar>
        <Button fullWidth size="lg" onClick={verify} loading={checking}>
          {checking ? "Verifying" : "Verify & continue"}
        </Button>
      </ActionBar>
    </Shell>
  );
}
