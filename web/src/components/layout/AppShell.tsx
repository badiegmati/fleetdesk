"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { Role } from "@/lib/rbac";
import { Logo } from "./Logo";
import { NavLinks } from "./NavLinks";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

type AppShellProps = {
  role: Role;
  name: string;
  children: React.ReactNode;
};

export function AppShell({ role, name, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Fermeture du tiroir mobile avec la touche Échap
  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  return (
    <div className="flex min-h-screen">
      <Sidebar role={role} />

      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              key="backdrop"
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawerOpen(false)}
            />
            <motion.aside
              key="drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Menu de navigation"
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col gap-6 border-r border-border bg-surface-2 p-4 md:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 320 }}
            >
              <div className="flex items-center justify-between px-3 pt-1">
                <Logo className="text-xl font-black tracking-tight" />
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Fermer le menu"
                  className="rounded-lg p-1.5 text-muted hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                >
                  <X size={18} />
                </button>
              </div>
              <NavLinks
                role={role}
                scope="mobile"
                onNavigate={() => setDrawerOpen(false)}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="min-w-0 flex-1">
        <Topbar name={name} role={role} onMenu={() => setDrawerOpen(true)} />
        <main className="p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
