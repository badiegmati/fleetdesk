"use client";

import { LogOut, Menu } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, type Role } from "@/lib/rbac";

type TopbarProps = {
  name: string;
  role: Role;
  onMenu: () => void;
};

export function Topbar({ name, role, onMenu }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-border bg-bg/70 px-4 py-3 backdrop-blur-xl md:px-8">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Ouvrir le menu"
        className="rounded-lg p-2 text-muted transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue md:hidden"
      >
        <Menu size={20} />
      </button>

      <div className="ml-auto flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium leading-tight">{name}</p>
        </div>
        <Badge tone="violet">{ROLE_LABELS[role]}</Badge>

        <form action={logout}>
          <button
            type="submit"
            aria-label="Se déconnecter"
            title="Se déconnecter"
            className="rounded-lg p-2 text-muted transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          >
            <LogOut size={18} />
          </button>
        </form>
      </div>
    </header>
  );
}
