"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/agencies", label: "Agences" },
  { href: "/settings/users", label: "Utilisateurs & rôles" },
  { href: "/settings/rates", label: "Tarifs" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Sections des paramètres" className="flex gap-1 border-b border-border">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
              active ? "text-white" : "text-muted hover:text-white",
            )}
          >
            {t.label}
            {active && (
              <motion.span
                layoutId="settings-tab"
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-brand-blue to-brand-violet"
                transition={{ type: "spring", damping: 28, stiffness: 320 }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
