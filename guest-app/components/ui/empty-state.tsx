import { type ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="glass-input flex flex-col items-center gap-3 rounded-card border border-dashed border-stone/30 px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-parchment text-stone">
        {icon}
      </div>
      <div>
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-1 text-sm text-stone">{description}</p>
      </div>
      {action}
    </div>
  );
}
