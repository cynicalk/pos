"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  prefix?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, error, prefix, id, ...props }, ref) => {
    const inputId = id ?? props.name;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-sm font-medium text-ink-soft"
          >
            {label}
          </label>
        )}
        <div
          className={cn(
            "glass-input flex h-12 items-center rounded-xl border shadow-lift transition-colors focus-within:border-ember focus-within:ring-2 focus-within:ring-ember/20",
            error ? "border-danger" : "border-white/60"
          )}
        >
          {prefix && (
            <span className="pl-4 pr-1 text-sm text-stone">{prefix}</span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "h-full w-full rounded-xl bg-transparent px-4 text-base text-ink outline-none placeholder:text-stone/70",
              prefix && "pl-1",
              className
            )}
            {...props}
          />
        </div>
        {error ? (
          <p className="mt-1.5 text-sm text-danger">{error}</p>
        ) : hint ? (
          <p className="mt-1.5 text-sm text-stone">{hint}</p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = "Input";
