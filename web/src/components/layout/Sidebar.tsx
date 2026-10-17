"use client";

import type { Role } from "@/lib/rbac";
import { Logo } from "./Logo";
import { NavLinks } from "./NavLinks";

export function Sidebar({ role }: { role: Role }) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r border-border bg-surface-2/60 p-4 backdrop-blur-xl md:flex">
      <Logo className="px-3 pt-1 text-xl font-black tracking-tight" />
      <NavLinks role={role} scope="desktop" />
    </aside>
  );
}
