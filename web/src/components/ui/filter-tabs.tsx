"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Option<T extends string> = { value: T; label: string; count?: number };

/** Onglets de filtre avec pastille animée partagée (layoutId). */
export function FilterTabs<T extends string>({
  options, value, onChange, layoutId, label,
}: { options: Option<T>[]; value: T; onChange: (v: T) => void; layoutId: string; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface-2 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
              active ? "text-white" : "text-muted hover:text-white",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-lg bg-gradient-to-r from-brand-blue/40 to-brand-violet/40 ring-1 ring-white/10"
                transition={{ type: "spring", damping: 28, stiffness: 320 }}
              />
            )}
            <span className="relative">
              {o.label}
              {o.count !== undefined && <span className="ml-1.5 opacity-60">{o.count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
