import { type ButtonHTMLAttributes, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type CardProps = HTMLAttributes<HTMLDivElement> &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    interactive?: boolean;
    selected?: boolean;
  };

export function Card({ className, interactive, selected, ...props }: CardProps) {
  const classes = cn(
    "glass rounded-card",
    interactive &&
      "block w-full cursor-pointer text-left transition-all duration-200 hover:border-ink/25 hover:shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/60",
    selected && "border-saffron ring-1 ring-saffron/40",
    className
  );

  // Interactive cards are real buttons so they're focusable and respond to
  // Enter/Space, not just clicks.
  if (interactive) {
    return <button type="button" className={classes} {...props} />;
  }
  return <div className={classes} {...props} />;
}
