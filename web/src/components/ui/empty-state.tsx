import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function EmptyState({
  icon: Icon, title, text, action,
}: { icon: LucideIcon; title: string; text: string; action?: React.ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
        <Icon size={26} className="text-brand-violet" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-sm text-sm text-muted">{text}</p>
      {action}
    </Card>
  );
}

/** Erreur de lecture (migration manquante, réseau…) : jamais de page blanche silencieuse. */
export function DbError({ message }: { message: string }) {
  return (
    <Card className="border-danger/40 p-5 text-sm">
      <p className="font-semibold text-red-200">Impossible de charger les données</p>
      <p className="mt-1 text-muted">{message}</p>
      <p className="mt-2 text-xs text-muted/80">
        Vérifie que les migrations SQL 0001 → 0008 ont bien été exécutées dans Supabase (SQL Editor).
      </p>
    </Card>
  );
}
