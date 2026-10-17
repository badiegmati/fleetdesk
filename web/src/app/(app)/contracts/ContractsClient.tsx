"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { fmtDate, money } from "@/lib/format";
import { fadeUp, stagger } from "@/lib/motion";

export type ContractRow = {
  id: string; contract_no: string; signed_at: string | null; closed_at: string | null;
  customer: string; vehicle: string; start_at: string; end_at: string; total: number;
};

type Filter = "all" | "todo" | "open" | "closed";
const stateOf = (c: ContractRow): Exclude<Filter, "all"> => (c.closed_at ? "closed" : c.signed_at ? "open" : "todo");

export function ContractsClient({ rows, currency }: { rows: ContractRow[]; currency: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const count = (f: Exclude<Filter, "all">) => rows.filter((r) => stateOf(r) === f).length;
  const shown = rows.filter((r) => filter === "all" || stateOf(r) === filter);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Aucun contrat pour l'instant"
        text="Un contrat se crée depuis une réservation : va dans Réservations puis clique sur « Créer le contrat »."
        action={<Link href="/bookings" className="text-sm font-medium text-brand-cyan hover:underline">Aller aux réservations</Link>}
      />
    );
  }

  return (
    <>
      <FilterTabs
        layoutId="contracts-filter"
        label="Filtrer les contrats"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "Tous", count: rows.length },
          { value: "todo", label: "À signer", count: count("todo") },
          { value: "open", label: "En cours", count: count("open") },
          { value: "closed", label: "Clôturés", count: count("closed") },
        ]}
      />
      <Card className="overflow-hidden">
        <motion.ul key={filter} variants={stagger(0, 0.03)} initial="hidden" animate="visible" className="divide-y divide-border">
          {shown.map((c) => {
            const st = stateOf(c);
            return (
              <motion.li key={c.id} variants={fadeUp}>
                <Link
                  href={`/contracts/${c.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue"
                >
                  <span className="w-20 font-mono text-sm text-brand-cyan">{c.contract_no}</span>
                  <div className="min-w-44 flex-1">
                    <p className="font-medium">{c.customer}</p>
                    <p className="text-xs text-muted">{c.vehicle}</p>
                  </div>
                  <p className="text-xs text-muted">{fmtDate(c.start_at)} → {fmtDate(c.end_at)}</p>
                  <p className="text-sm">{money(c.total, currency)}</p>
                  <Badge tone={st === "closed" ? "muted" : st === "open" ? "cyan" : "warning"}>
                    {st === "closed" ? "Clôturé" : st === "open" ? "En cours" : "À signer"}
                  </Badge>
                  <ChevronRight size={16} className="text-muted" aria-hidden="true" />
                </Link>
              </motion.li>
            );
          })}
        </motion.ul>
      </Card>
    </>
  );
}
