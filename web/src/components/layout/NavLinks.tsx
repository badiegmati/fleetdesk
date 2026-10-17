"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { can, type Role } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";

type NavLinksProps = {
  role: Role;
  /** Évite un conflit de layoutId entre la sidebar et le tiroir mobile. */
  scope: string;
  onNavigate?: () => void;
};

export function NavLinks({ role, scope, onNavigate }: NavLinksProps) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => can(role, item.section));

  return (
    <nav aria-label="Navigation principale" className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon }) => {
        const base = `/${href.split("/")[1]}`;
        const active = pathname === base || pathname.startsWith(`${base}/`);

        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
              active ? "text-white" : "text-muted hover:text-white",
            )}
          >
            {active && (
              <motion.span
                layoutId={`${scope}-nav-active`}
                className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand-blue/25 to-brand-violet/25 ring-1 ring-white/10"
                transition={{ type: "spring", stiffness: 340, damping: 28 }}
              />
            )}
            <Icon size={17} className="relative z-10" aria-hidden="true" />
            <span className="relative z-10">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
