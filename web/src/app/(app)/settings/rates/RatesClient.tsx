"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Plus, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormAlert } from "@/components/ui/form-alert";
import { Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useFormAction } from "@/components/ui/useFormAction";
import { money } from "@/lib/format";
import { fadeUp, stagger } from "@/lib/motion";
import type { Category } from "@/types/db";
import { deleteCategory, saveCategory } from "../actions";

export function RatesClient({ categories, currency }: { categories: Category[]; currency: string }) {
  const [editing, setEditing] = useState<Category | "new" | null>(null);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Le tarif journalier de base est appliqué aux nouvelles réservations selon la catégorie du véhicule.</p>
        <Button onClick={() => setEditing("new")}>
          <Plus size={16} aria-hidden="true" /> Nouvelle catégorie
        </Button>
      </div>

      {categories.length === 0 ? (
        <EmptyState icon={Tag} title="Aucune catégorie" text="Crée des catégories (Économique, SUV, Utilitaire…) avec leur tarif journalier." />
      ) : (
        <Card className="overflow-hidden">
          <motion.ul variants={stagger(0, 0.04)} initial="hidden" animate="visible" className="divide-y divide-border">
            {categories.map((c) => (
              <motion.li key={c.id} variants={fadeUp} className="flex items-center justify-between gap-4 px-5 py-4">
                <span className="font-medium">{c.name}</span>
                <span className="flex items-center gap-4">
                  <span className="text-sm text-brand-cyan">{money(c.daily_rate, currency)} / jour</span>
                  <button
                    type="button"
                    onClick={() => setEditing(c)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                  >
                    Modifier
                  </button>
                </span>
              </motion.li>
            ))}
          </motion.ul>
        </Card>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Nouvelle catégorie" : "Modifier la catégorie"}>
        {editing !== null && <CategoryForm category={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}

function CategoryForm({ category, onDone }: { category: Category | null; onDone: () => void }) {
  const toast = useToast();
  const [deleting, startDelete] = useTransition();
  const { state, formAction, pending } = useFormAction(saveCategory, {
    successMessage: "Catégorie enregistrée",
    onSuccess: onDone,
  });

  const remove = () => {
    if (!category || !window.confirm(`Supprimer « ${category.name} » ? Les véhicules concernés passeront « sans catégorie ».`)) return;
    startDelete(async () => {
      const r = await deleteCategory(category.id);
      if (r.ok) {
        toast("Catégorie supprimée");
        onDone();
      } else toast(r.error ?? "Erreur", "error");
    });
  };

  return (
    <form action={formAction} className="space-y-4">
      {category && <input type="hidden" name="id" value={category.id} />}
      <Field id="name" label="Nom" defaultValue={category?.name} required />
      <Field id="daily_rate" label="Tarif journalier" type="number" step="0.01" min={0} defaultValue={category?.daily_rate ?? ""} required />
      <FormAlert error={state.error} nonce={state.nonce} />
      <div className="flex items-center justify-between gap-3 pt-2">
        {category ? (
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
