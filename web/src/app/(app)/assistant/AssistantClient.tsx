"use client";

import { useActionState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Lightbulb, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormAlert } from "@/components/ui/form-alert";
import { Field, SelectField } from "@/components/ui/input";
import { money } from "@/lib/format";
import { fadeUp, stagger } from "@/lib/motion";
import type { Agency, Category } from "@/types/db";
import { ChatPanel } from "./ChatPanel";
import { findAvailable, type SearchState } from "./actions";

export function AssistantClient({
  agencies, categories, canBook, currency,
}: { agencies: Agency[]; categories: Category[]; canBook: boolean; currency: string }) {
  const [state, action, pending] = useActionState(findAvailable, {} as SearchState);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Tunis" });

  return (
    <div className="space-y-6">
      <ChatPanel />

      <Card className="p-6">
        <h2 className="flex items-center gap-2 font-semibold"><Search size={17} aria-hidden="true" /> Disponibilités</h2>
        <form action={action} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField id="agency_id" label="Agence" defaultValue="">
              <option value="">Toutes les agences</option>
              {agencies.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </SelectField>
            <SelectField id="category_id" label="Catégorie" defaultValue="">
              <option value="">Toutes les catégories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </SelectField>
            <Field id="from" label="Départ" type="date" min={today} defaultValue={today} required />
            <Field id="to" label="Retour" type="date" min={today} required />
          </div>
          <FormAlert error={state.error} nonce={state.nonce} />
          <Button type="submit" loading={pending}>Chercher</Button>
        </form>
      </Card>

      {state.results && (
        <motion.div key={state.nonce} variants={stagger(0, 0.05)} initial="hidden" animate="visible" className="space-y-4">
          <motion.div variants={fadeUp}>
            <Card className="flex items-start gap-3 border-brand-violet/30 p-4">
              <Lightbulb size={18} className="mt-0.5 shrink-0 text-brand-violet" aria-hidden="true" />
              <div className="text-sm">
                <Badge tone="violet" className="mb-1.5">Suggestion tarifaire</Badge>
                <p>{state.advice}</p>
                <p className="mt-1 text-xs text-muted">Règle déterministe basée sur le taux d&apos;occupation ; à valider par l&apos;agent.</p>
              </div>
            </Card>
          </motion.div>

          {state.results.length === 0 ? (
            <motion.div variants={fadeUp}>
              <Card className="p-8 text-center text-sm text-muted">Aucun véhicule libre sur cette période.</Card>
            </motion.div>
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-border">
                {state.results.map((v) => (
                  <motion.li key={v.id} variants={fadeUp} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                    <div className="min-w-44 flex-1">
                      <p className="font-medium">{v.label}</p>
                      <p className="font-mono text-xs text-muted">{v.plate}{v.category ? ` · ${v.category}` : ""}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-semibold text-brand-cyan">{money(v.suggestedRate, currency)} / jour</p>
                      {v.suggestedRate !== v.baseRate && <p className="text-xs text-muted line-through">{money(v.baseRate, currency)}</p>}
                    </div>
                    {canBook && (
                      <Link
                        href={`/bookings?vehicle=${v.id}&from=${state.from}&to=${state.to}`}
                        className="rounded-xl bg-gradient-to-r from-brand-blue to-brand-violet px-3.5 py-2 text-xs font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                      >
                        Préparer la réservation
                      </Link>
                    )}
                  </motion.li>
                ))}
              </ul>
            </Card>
          )}
        </motion.div>
      )}

    </div>
  );
}
