"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Plus, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormAlert } from "@/components/ui/form-alert";
import { Field, SelectField } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useFormAction } from "@/components/ui/useFormAction";
import { MAINTENANCE_TYPE, fmtDate, money, num } from "@/lib/format";
import { fadeUp, stagger } from "@/lib/motion";
import type { MaintenanceType } from "@/types/db";
import { finishMaintenance, saveMaintenance } from "./actions";

export type MaintRow = {
  id: string; vehicle_id: string; vehicle: string; type: MaintenanceType; description: string | null;
  start_date: string; end_date: string | null; cost: number | null; ongoing: boolean;
};
export type AlertRow = { id: string; label: string; km: number };

type Props = {
  rows: MaintRow[]; alerts: AlertRow[]; vehicles: { id: string; label: string }[];
  canEdit: boolean; currency: string; today: string;
};

export function MaintenanceClient({ rows, alerts, vehicles, canEdit, currency, today }: Props) {
  const [open, setOpen] = useState<string | null>(null); // id du véhicule présélectionné ou "new"
  const toast = useToast();
  const [pending, start] = useTransition();

  return (
    <>
      {alerts.length > 0 && (
        <Card className="border-warning/30 p-5">
          <h2 className="flex items-center gap-2 font-semibold text-warning">
            <AlertTriangle size={17} aria-hidden="true" /> Alertes de maintenance
          </h2>
          <p className="mt-1 text-xs text-muted">Règle : plus de 10 000 km et aucune intervention préventive depuis 180 jours.</p>
          <ul className="mt-3 space-y-2">
            {alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span>{a.label} <span className="text-muted">· {num(a.km)} km</span></span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setOpen(a.id)}
                    className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                  >
                    Planifier
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex justify-end">
        {canEdit && (
          <Button onClick={() => setOpen("new")} disabled={vehicles.length === 0}>
            <Plus size={16} aria-hidden="true" /> Planifier une intervention
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Wrench} title="Aucune intervention" text="Planifie un entretien : le véhicule est bloqué automatiquement sur la période." />
      ) : (
        <Card className="overflow-hidden">
          <motion.ul variants={stagger(0, 0.03)} initial="hidden" animate="visible" className="divide-y divide-border">
            {rows.map((m) => (
              <motion.li key={m.id} variants={fadeUp} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                <div className="min-w-48 flex-1">
                  <p className="font-medium">{m.vehicle}</p>
                  <p className="text-xs text-muted">{MAINTENANCE_TYPE[m.type]}{m.description ? ` — ${m.description}` : ""}</p>
                </div>
                <p className="text-xs text-muted">{fmtDate(m.start_date)} → {m.end_date ? fmtDate(m.end_date) : "en cours"}</p>
                <p className="w-24 text-right text-sm">{m.cost != null ? money(m.cost, currency) : "—"}</p>
                {m.ongoing ? <Badge tone="warning">En cours</Badge> : m.start_date > today ? <Badge tone="blue">Planifiée</Badge> : <Badge tone="muted">Terminée</Badge>}
                {canEdit && m.ongoing && (
                  <Button
                    variant="ghost"
                    className="px-3 py-1.5 text-xs"
                    loading={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await finishMaintenance(m.id, m.vehicle_id);
                        toast(r.ok ? "Intervention terminée — véhicule libéré" : (r.error ?? "Erreur"), r.ok ? "success" : "error");
                      })
                    }
                  >
                    Terminer
                  </Button>
                )}
              </motion.li>
            ))}
          </motion.ul>
        </Card>
      )}

      <Modal open={open !== null} onClose={() => setOpen(null)} title="Planifier une intervention">
        {open !== null && <MaintForm vehicles={vehicles} presetVehicle={open === "new" ? undefined : open} today={today} onDone={() => setOpen(null)} />}
      </Modal>
    </>
  );
}

function MaintForm({
  vehicles, presetVehicle, today, onDone,
}: { vehicles: { id: string; label: string }[]; presetVehicle?: string; today: string; onDone: () => void }) {
  const { state, formAction, pending } = useFormAction(saveMaintenance, { successMessage: "Intervention planifiée", onSuccess: onDone });
  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="vehicle_id" label="Véhicule" defaultValue={presetVehicle ?? vehicles[0]?.id} required>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </SelectField>
        <SelectField id="type" label="Type" defaultValue="preventive">
          {(Object.keys(MAINTENANCE_TYPE) as MaintenanceType[]).map((t) => (
            <option key={t} value={t}>{MAINTENANCE_TYPE[t]}</option>
          ))}
        </SelectField>
        <Field id="start_date" label="Début" type="date" defaultValue={today} required />
        <Field id="end_date" label="Fin prévue" type="date" hint="Vide = durée indéterminée" />
        <Field id="cost" label="Coût estimé" type="number" step="0.01" min={0} />
        <Field id="description" label="Description" placeholder="Vidange, freins…" />
      </div>
      <FormAlert error={state.error} nonce={state.nonce} />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>Annuler</Button>
        <Button type="submit" loading={pending}>Planifier</Button>
      </div>
    </form>
  );
}
