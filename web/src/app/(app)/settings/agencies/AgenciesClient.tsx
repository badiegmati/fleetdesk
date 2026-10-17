"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Building2, MapPin, Phone, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormAlert } from "@/components/ui/form-alert";
import { Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useFormAction } from "@/components/ui/useFormAction";
import { fadeUp, stagger } from "@/lib/motion";
import type { Agency } from "@/types/db";
import { deleteAgency, saveAgency } from "../actions";

type Row = Agency & { vehicles: { count: number }[] };

export function AgenciesClient({ agencies }: { agencies: Row[] }) {
  const [editing, setEditing] = useState<Row | "new" | null>(null);

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus size={16} aria-hidden="true" /> Nouvelle agence
        </Button>
      </div>

      {agencies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Aucune agence pour l'instant"
          text="Crée ta première agence : elle est nécessaire pour ajouter des véhicules."
        />
      ) : (
        <motion.ul variants={stagger(0, 0.05)} initial="hidden" animate="visible" className="grid gap-4 sm:grid-cols-2">
          {agencies.map((a) => (
            <motion.li key={a.id} variants={fadeUp}>
              <Card className="h-full p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{a.name}</h2>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                      <MapPin size={12} aria-hidden="true" />
                      {[a.city, a.address].filter(Boolean).join(" · ") || "Adresse non renseignée"}
                    </p>
                    {a.phone && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                        <Phone size={12} aria-hidden="true" />{a.phone}
                      </p>
                    )}
                  </div>
                  <Badge tone="cyan">{a.vehicles?.[0]?.count ?? 0} véhicule(s)</Badge>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(a)}
                  className="mt-4 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                >
                  Modifier
                </button>
              </Card>
            </motion.li>
          ))}
        </motion.ul>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Nouvelle agence" : "Modifier l'agence"}>
        {editing !== null && <AgencyForm agency={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}

function AgencyForm({ agency, onDone }: { agency: Row | null; onDone: () => void }) {
  const toast = useToast();
  const [deleting, startDelete] = useTransition();
  const { state, formAction, pending } = useFormAction(saveAgency, {
    successMessage: agency ? "Agence mise à jour" : "Agence créée",
    onSuccess: onDone,
  });

  const remove = () => {
    if (!agency || !window.confirm(`Supprimer l'agence « ${agency.name} » ?`)) return;
    startDelete(async () => {
      const r = await deleteAgency(agency.id);
      if (r.ok) {
        toast("Agence supprimée");
        onDone();
      } else toast(r.error ?? "Erreur", "error");
    });
  };

  return (
    <form action={formAction} className="space-y-4">
      {agency && <input type="hidden" name="id" value={agency.id} />}
      <Field id="name" label="Nom de l'agence" defaultValue={agency?.name} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="city" label="Ville" defaultValue={agency?.city ?? ""} />
        <Field id="phone" label="Téléphone" defaultValue={agency?.phone ?? ""} />
      </div>
      <Field id="address" label="Adresse" defaultValue={agency?.address ?? ""} />
      <FormAlert error={state.error} nonce={state.nonce} />
      <div className="flex items-center justify-between gap-3 pt-2">
        {agency ? (
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
