"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember disabled:pointer-events-none active:scale-[0.98] select-none",
  {
    variants: {
      variant: {
        primary:
          "btn-sheen bg-ember text-cream hover:bg-ember-deep disabled:bg-ink/10 disabled:text-ink/35",
        secondary:
          "glass-dark text-cream hover:bg-ink disabled:opacity-50",
        outline:
          "border border-ink/20 bg-transparent text-ink hover:border-ink/50 hover:bg-white/40 disabled:opacity-50",
        ghost: "text-ink-soft hover:bg-ink/5 hover:text-ink disabled:opacity-50",
        danger: "bg-danger text-cream hover:bg-danger/90 disabled:opacity-50",
      },
      // Capsule shape across all sizes, per the iOS 27 button geometry.
      size: {
        sm: "h-9 rounded-full px-4 text-sm",
        md: "h-11 rounded-full px-5 text-sm",
        lg: "h-13 rounded-full px-6 text-base",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
);
Button.displayName = "Button";
