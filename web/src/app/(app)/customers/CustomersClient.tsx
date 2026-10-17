"use client";

import { useMemo, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Mail, Phone, Plus, Search, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormAlert } from "@/components/ui/form-alert";
import { Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useFormAction } from "@/components/ui/useFormAction";
import { fmtDate } from "@/lib/format";
import { fadeUp, stagger } from "@/lib/motion";
import type { Customer } from "@/types/db";
import { deleteCustomer, saveCustomer } from "./actions";

export type CustomerRow = Customer & { created_at: string; bookings: { count: number }[] };

export function CustomersClient({ customers, canEdit }: { customers: CustomerRow[]; canEdit: boolean }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<CustomerRow | "new" | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter(
      (c) => !q || `${c.full_name} ${c.email ?? ""} ${c.phone ?? ""} ${c.license_no ?? ""}`.toLowerCase().includes(q),
    );
  }, [customers, query]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1 sm:max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nom, e-mail, téléphone, permis…"
            aria-label="Rechercher un client"
            className="w-full rounded-xl border border-border bg-surface-2 py-2.5 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          />
        </div>
        {canEdit && (
          <Button className="ml-auto" onClick={() => setEditing("new")}>
            <Plus size={16} aria-hidden="true" /> Nouveau client
          </Button>
        )}
      </div>

      {customers.length === 0 ? (
        <EmptyState icon={Users} title="Aucun client pour l'instant" text="Ajoute ton premier client pour pouvoir créer des réservations." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="Aucun résultat" text="Aucun client ne correspond à cette recherche." />
      ) : (
        <Card className="overflow-hidden">
          <motion.ul key={query} variants={stagger(0, 0.03)} initial="hidden" animate="visible" className="divide-y divide-border">
            {filtered.map((c) => (
              <motion.li key={c.id} variants={fadeUp} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-blue/25 to-brand-violet/25 text-sm font-semibold ring-1 ring-white/10">
                  {c.full_name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.full_name}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    {c.email && <span className="flex items-center gap-1"><Mail size={12} aria-hidden="true" />{c.email}</span>}
                    {c.phone && <span className="flex items-center gap-1"><Phone size={12} aria-hidden="true" />{c.phone}</span>}
                    {c.license_no && <span>Permis {c.license_no}</span>}
                  </p>
                </div>
                <Badge tone="blue">{c.bookings?.[0]?.count ?? 0} location(s)</Badge>
                <span className="hidden text-xs text-muted md:block">Depuis {fmtDate(c.created_at)}</span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setEditing(c)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                  >
                    Modifier
                  </button>
                )}
              </motion.li>
            ))}
          </motion.ul>
        </Card>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Nouveau client" : "Modifier le client"}>
        {editing !== null && <CustomerForm customer={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}

function CustomerForm({ customer, onDone }: { customer: CustomerRow | null; onDone: () => void }) {
  const toast = useToast();
  const [deleting, startDelete] = useTransition();
  const { state, formAction, pending } = useFormAction(saveCustomer, {
    successMessage: customer ? "Client mis à jour" : "Client ajouté",
    onSuccess: onDone,
  });

  const remove = () => {
    if (!customer || !window.confirm(`Supprimer ${customer.full_name} ?`)) return;
    startDelete(async () => {
      const r = await deleteCustomer(customer.id);
      if (r.ok) {
        toast("Client supprimé");
        onDone();
      } else toast(r.error ?? "Erreur", "error");
    });
  };

  return (
    <form action={formAction} className="space-y-4">
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <Field id="full_name" label="Nom complet" defaultValue={customer?.full_name} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="email" label="E-mail" type="email" defaultValue={customer?.email ?? ""} />
        <Field id="phone" label="Téléphone" defaultValue={customer?.phone ?? ""} />
      </div>
      <Field id="license_no" label="N° de permis" defaultValue={customer?.license_no ?? ""} />
      <FormAlert error={state.error} nonce={state.nonce} />
      <div className="flex items-center justify-between gap-3 pt-2">
        {customer ? (
          <Button type="button" variant="ghost" onClick={remove} loading={deleting} className="text-red-300">
            <Trash2 size={15} aria-hidden="true" /> Supprimer
          </Button>
        ) : <span />}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>Annuler</Button>
          <Button type="submit" loading={pending}>Enregistrer</Button>
        </div>
      </div>
    </form>
  );
}
