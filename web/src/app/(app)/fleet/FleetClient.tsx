"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Car, Gauge, MapPin, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { FormAlert } from "@/components/ui/form-alert";
import { Field, MiniSelect, SelectField } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { VehicleBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { useFormAction } from "@/components/ui/useFormAction";
import { VEHICLE_STATUS, num } from "@/lib/format";
import { fadeUp, stagger } from "@/lib/motion";
import type { Agency, Category, Vehicle, VehicleStatus } from "@/types/db";
import { deleteVehicle, saveVehicle } from "./actions";

export type VehicleRow = Vehicle & {
  agencies: { name: string } | null;
  vehicle_categories: { name: string; daily_rate: number } | null;
};

type Props = { vehicles: VehicleRow[]; agencies: Agency[]; categories: Category[]; canEdit: boolean };

export function FleetClient({ vehicles, agencies, categories, canEdit }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | VehicleStatus>("all");
  const [agency, setAgency] = useState("all");
  const [editing, setEditing] = useState<VehicleRow | "new" | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vehicles.filter(
      (v) =>
        (status === "all" || v.status === status) &&
        (agency === "all" || v.agency_id === agency) &&
        (!q || `${v.plate} ${v.brand} ${v.model}`.toLowerCase().includes(q)),
    );
  }, [vehicles, query, status, agency]);

  const count = (s: VehicleStatus) => vehicles.filter((v) => v.status === s).length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Plaque, marque, modèle…"
            aria-label="Rechercher un véhicule"
            className="w-full rounded-xl border border-border bg-surface-2 py-2.5 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          />
        </div>
        <FilterTabs
          layoutId="fleet-status"
          label="Filtrer par statut"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "Tous", count: vehicles.length },
            { value: "disponible", label: "Disponibles", count: count("disponible") },
            { value: "loue", label: "Loués", count: count("loue") },
            { value: "maintenance", label: "Maintenance", count: count("maintenance") },
          ]}
        />
        {agencies.length > 1 && (
          <MiniSelect value={agency} onChange={(e) => setAgency(e.target.value)} aria-label="Filtrer par agence">
            <option value="all">Toutes les agences</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </MiniSelect>
        )}
        {canEdit && (
          <Button className="ml-auto" onClick={() => setEditing("new")} disabled={agencies.length === 0}>
            <Plus size={16} aria-hidden="true" /> Ajouter un véhicule
          </Button>
        )}
      </div>

      {vehicles.length === 0 ? (
        <EmptyState
          icon={Car}
          title="Aucun véhicule pour l'instant"
          text={
            agencies.length === 0
              ? "Crée d'abord une agence dans Paramètres → Agences (ou charge la démo depuis le Dashboard)."
              : "Ajoute ton premier véhicule pour commencer à gérer ta flotte."
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="Aucun résultat" text="Aucun véhicule ne correspond à ces filtres." />
      ) : (
        <motion.ul
          key={`${status}-${agency}-${query}`}
          variants={stagger(0, 0.04)}
          initial="hidden"
          animate="visible"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {filtered.map((v) => (
            <motion.li key={v.id} variants={fadeUp}>
              <Card className="group h-full p-5 transition-colors hover:border-white/20">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/fleet/${v.id}`}
                      className="text-base font-semibold hover:text-brand-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                    >
                      {v.brand} {v.model}
                    </Link>
                    <p className="mt-0.5 font-mono text-xs text-muted">{v.plate}</p>
                  </div>
                  <VehicleBadge status={v.status} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted">
                  <div className="flex items-center gap-1.5"><Gauge size={13} aria-hidden="true" />{num(v.mileage_km)} km</div>
                  <div className="flex items-center gap-1.5"><MapPin size={13} aria-hidden="true" />{v.agencies?.name ?? "—"}</div>
                  <div>{v.vehicle_categories?.name ?? "Sans catégorie"}{v.year ? ` · ${v.year}` : ""}</div>
                  <div className="text-right text-text">
                    {v.vehicle_categories ? `${v.vehicle_categories.daily_rate} / jour` : ""}
                  </div>
                </dl>
                <div className="mt-4 flex gap-2">
                  <Link
                    href={`/fleet/${v.id}`}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                  >
                    Fiche
                  </Link>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setEditing(v)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                    >
                      Modifier
                    </button>
                  )}
                </div>
              </Card>
            </motion.li>
          ))}
        </motion.ul>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Nouveau véhicule" : "Modifier le véhicule"}
      >
        {editing !== null && (
          <VehicleForm
            vehicle={editing === "new" ? null : editing}
            agencies={agencies}
            categories={categories}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  );
}

function VehicleForm({
  vehicle, agencies, categories, onDone,
}: { vehicle: VehicleRow | null; agencies: Agency[]; categories: Category[]; onDone: () => void }) {
  const toast = useToast();
  const [deleting, startDelete] = useTransition();
  const { state, formAction, pending } = useFormAction(saveVehicle, {
    successMessage: vehicle ? "Véhicule mis à jour" : "Véhicule ajouté",
    onSuccess: onDone,
  });

  const remove = () => {
    if (!vehicle || !window.confirm(`Supprimer ${vehicle.brand} ${vehicle.model} (${vehicle.plate}) ?`)) return;
    startDelete(async () => {
      const r = await deleteVehicle(vehicle.id);
      if (r.ok) {
        toast("Véhicule supprimé");
        onDone();
      } else toast(r.error ?? "Erreur", "error");
    });
  };

  return (
    <form action={formAction} className="space-y-4">
      {vehicle && <input type="hidden" name="id" value={vehicle.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="plate" label="Immatriculation" defaultValue={vehicle?.plate} required placeholder="123 TN 4567" />
        <Field id="year" label="Année" type="number" defaultValue={vehicle?.year ?? ""} placeholder="2023" />
        <Field id="brand" label="Marque" defaultValue={vehicle?.brand} required />
        <Field id="model" label="Modèle" defaultValue={vehicle?.model} required />
        <Field id="mileage_km" label="Kilométrage" type="number" min={0} defaultValue={vehicle?.mileage_km ?? 0} />
        <SelectField id="status" label="Statut" defaultValue={vehicle?.status ?? "disponible"}>
          {(Object.keys(VEHICLE_STATUS) as VehicleStatus[]).map((s) => (
            <option key={s} value={s}>{VEHICLE_STATUS[s].label}</option>
          ))}
        </SelectField>
        <SelectField id="agency_id" label="Agence" defaultValue={vehicle?.agency_id ?? agencies[0]?.id} required>
          {agencies.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </SelectField>
        <SelectField id="category_id" label="Catégorie (tarif)" defaultValue={vehicle?.category_id ?? ""}>
          <option value="">Sans catégorie</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name} — {c.daily_rate}/jour</option>
          ))}
        </SelectField>
      </div>
      <FormAlert error={state.error} nonce={state.nonce} />
      <div className="flex items-center justify-between gap-3 pt-2">
        {vehicle ? (
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
