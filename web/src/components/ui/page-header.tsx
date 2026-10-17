import type { LucideIcon } from "lucide-react";

export function PageHeader({
  icon: Icon, title, description, actions,
}: { icon: LucideIcon; title: string; description: string; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-brand-blue/25 to-brand-violet/25 p-3 ring-1 ring-white/10">
          <Icon size={22} className="text-brand-cyan" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
