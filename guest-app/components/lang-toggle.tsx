"use client";

import { useLang } from "@/hooks/use-lang";
import { LANGS } from "@/lib/i18n";

// Compact EN / हिं pill toggle. Drop it wherever a language switch belongs
// (landing, shell header). Persists via the LangProvider.
export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <div
      role="group"
      aria-label="Language"
      className={`inline-flex items-center gap-0.5 rounded-full border border-current/15 p-0.5 ${className}`}
    >
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          aria-pressed={lang === l.code}
          onClick={() => setLang(l.code)}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/40 ${
            lang === l.code
              ? "bg-current/15 font-semibold"
              : "opacity-70 hover:opacity-100"
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
