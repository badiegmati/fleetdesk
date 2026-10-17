"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { CalendarDays, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormAlert } from "@/components/ui/form-alert";
import { Field, MiniSelect, SelectField, TextareaField } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { BookingBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { useFormAction } from "@/components/ui/useFormAction";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { fmtDateTime, money } from "@/lib/format";
import { fadeUp, stagger } from "@/lib/motion";
import type { Agency, BookingStatus, Customer, VehicleStatus } from "@/types/db";
import { createContract, saveBooking, setBookingStatus } from "./actions";
import { Timeline } from "./Timeline";

export type VehicleOpt = { id: string; plate: string; label: string; agency_id: string; status: VehicleStatus; rate: number };
export type BookingRow = {
  id: string; vehicle_id: string; customer_id: string; start_at: string; end_at: string;
  status: BookingStatus; total_amount: number; customer: string; vehicle: string; contractId: string | null; aiDraft: boolean;
};

type Props = {
  vehicles: VehicleOpt[]; customers: Customer[]; agencies: Agency[];
  windowBookings: BookingRow[]; upcoming: BookingRow[];
  startKey: string; todayKey: string; agencyFilter: string;
  canEdit: boolean; canContract: boolean; currency: string;
  prefill: { vehicleId: string; from?: string; to?: string } | null;
};

type Draft = { vehicleId?: string; start: string; end: string };

const atTen = (key: string) => `${key}T10:00`;
const nextDay = (key: string) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export function BookingsClient(props: Props) {
  const { vehicles, customers, agencies, windowBookings, upcoming, startKey, todayKey, agencyFilter, canEdit, canContract, currency, prefill } = props;
  const router = useRouter();
  useRealtimeRefresh(["bookings", "vehicles"]);

  const [draft, setDraft] = useState<Draft | null>(
    prefill
      ? { vehicleId: prefill.vehicleId, start: atTen(prefill.from ?? todayKey), end: atTen(prefill.to ?? nextDay(prefill.from ?? todayKey)) }
      : null,
  );

  const shownVehicles = useMemo(
    () => vehicles.filter((v) => agencyFilter === "all" || v.agency_id === agencyFilter),
    [vehicles, agencyFilter],
  );
  const shownIds = new Set(shownVehicles.map((v) => v.id));

  const openNew = () => setDraft({ start: atTen(todayKey), end: atTen(nextDay(todayKey)) });

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {agencies.length > 1 && (
          <MiniSelect
            value={agencyFilter}
            aria-label="Filtrer par agence"
            onChange={(e) => router.push(`/bookings?start=${startKey}${e.target.value !== "all" ? `&agency=${e.target.value}` : ""}`)}
          >
            <option value="all">Toutes les agences</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </MiniSelect>
        )}
        {canEdit && (
          <Button className="ml-auto" onClick={openNew} disabled={vehicles.length === 0 || customers.length === 0}>
            <Plus size={16} aria-hidden="true" /> Nouvelle réservation
          </Button>
        )}
      </div>

      {vehicles.length === 0 || customers.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Il manque des données pour réserver"
          text={`Ajoute au moins un véhicule et un client${vehicles.length === 0 ? " (Flotte)" : " (Clients)"}, ou charge la démo depuis le Dashboard.`}
        />
      ) : (
        <Timeline
          vehicles={shownVehicles}
          bookings={windowBookings.filter((b) => shownIds.has(b.vehicle_id))}
          startKey={startKey}
          todayKey={todayKey}
          agencyParam={agencyFilter}
          canEdit={canEdit}
          onPickCell={(vehicleId, d) => setDraft({ vehicleId, start: atTen(d), end: atTen(nextDay(d)) })}
        />
      )}

      <section aria-labelledby="upcoming-title" className="space-y-3">
        <h2 id="upcoming-title" className="text-lg font-semibold">Réservations à traiter</h2>
        {upcoming.length === 0 ? (
          <EmptyState icon={CalendarDays} title="Aucune réservation en cours" text="Les réservations en attente, confirmées ou en cours apparaîtront ici." />
        ) : (
          <Card className="overflow-hidden">
            <motion.ul variants={stagger(0, 0.03)} initial="hidden" animate="visible" className="divide-y divide-border">
              {upcoming.map((b) => (
                <motion.li key={b.id} variants={fadeUp}>
                  <BookingItem b={b} canEdit={canEdit} canContract={canContract} currency={currency} />
                </motion.li>
              ))}
            </motion.ul>
          </Card>
        )}
      </section>

      <Modal open={draft !== null} onClose={() => setDraft(null)} title="Nouvelle réservation" description="Le véhicule est bloqué sur la période choisie." size="lg">
        {draft && (
          <BookingForm draft={draft} vehicles={vehicles} customers={customers} currency={currency} onDone={() => setDraft(null)} />
        )}
      </Modal>
    </>
  );
}

function BookingItem({ b, canEdit, canContract, currency }: { b: BookingRow; canEdit: boolean; canContract: boolean; currency: string }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok?: boolean; error?: string; id?: string }>, success: string, after?: (id?: string) => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast(success);
        after?.(r.id);
      } else toast(r.error ?? "Erreur", "error");
    });

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
      <div className="min-w-48 flex-1">
        <p className="font-medium">{b.customer}</p>
        <p className="text-xs text-muted">{b.vehicle}</p>
      </div>
      <p className="text-xs text-muted">{fmtDateTime(b.start_at)} → {fmtDateTime(b.end_at)}</p>
      <p className="text-sm text-brand-cyan">{money(b.total_amount, currency)}</p>
      <BookingBadge status={b.status} />
      {b.aiDraft && b.status === "pending" && <Badge tone="violet">Brouillon IA à valider</Badge>}
      <div className="flex gap-2">
        {canEdit && b.status === "pending" && (
          <Button variant="ghost" loading={pending} className="px-3 py-1.5 text-xs" onClick={() => run(() => setBookingStatus(b.id, "confirmed"), "Réservation confirmée")}>
            Confirmer
          </Button>
        )}
        {canEdit && (b.status === "pending" || b.status === "confirmed") && !b.contractId && (
          <Button
            variant="ghost"
            loading={pending}
            className="px-3 py-1.5 text-xs text-red-300"
            onClick={() => window.confirm("Annuler cette réservation ?") && run(() => setBookingStatus(b.id, "cancelled"), "Réservation annulée")}
          >
            Annuler
          </Button>
        )}
        {b.contractId ? (
          <Link href={`/contracts/${b.contractId}`} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue">
            <FileText size={13} aria-hidden="true" /> Contrat
          </Link>
        ) : (
          canContract && (b.status === "pending" || b.status === "confirmed") && (
            <Button
              loading={pending}
              className="px-3 py-1.5 text-xs"
              onClick={() => {
                const raw = window.prompt(`Caution (${currency}) — laisser 0 si aucune`, "0");
                if (raw === null) return;
                run(() => createContract(b.id, Number(raw.replace(",", "."))), "Contrat créé", (id) => id && router.push(`/contracts/${id}`));
              }}
            >
              Créer le contrat
            </Button>
          )
        )}
      </div>
    </div>
  );
}

function BookingForm({
  draft, vehicles, customers, currency, onDone,
}: { draft: Draft; vehicles: VehicleOpt[]; customers: Customer[]; currency: string; onDone: () => void }) {
  const [vehicleId, setVehicleId] = useState(draft.vehicleId ?? vehicles[0]?.id ?? "");
  const [start, setStart] = useState(draft.start);
  const [end, setEnd] = useState(draft.end);
  const { state, formAction, pending } = useFormAction(saveBooking, { successMessage: "Réservation créée", onSuccess: onDone });

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const days = Number.isFinite(ms) && ms > 0 ? Math.max(1, Math.ceil(ms / 86_400_000)) : 0;

  return (
    <form
      className="space-y-4"
      action={(fd) => {
        // datetime-local n'a pas de fuseau : on envoie un instant ISO univoque.
        fd.set("start_at", new Date(start).toISOString());
        fd.set("end_at", new Date(end).toISOString());
        formAction(fd);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="vehicle_id" label="Véhicule" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label} — {v.plate}{v.status === "maintenance" ? " (maintenance)" : ""}
            </option>
          ))}
        </SelectField>
        <SelectField id="customer_id" label="Client" defaultValue={customers[0]?.id} required>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.full_name}</option>
          ))}
        </SelectField>
        <Field id="start_local" label="Départ" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
        <Field id="end_local" label="Retour" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required />
        <SelectField id="status" label="Statut" defaultValue="confirmed">
          <option value="confirmed">Confirmée</option>
          <option value="pending">En attente</option>
        </SelectField>
        <div className="flex flex-col justify-end rounded-xl border border-border bg-white/[0.03] px-4 py-2.5 text-sm">
          <span className="text-xs text-muted">Estimation ({days} jour{days > 1 ? "s" : ""})</span>
          <span className="font-semibold text-brand-cyan">{money(days * (vehicle?.rate ?? 0), currency)}</span>
        </div>
      </div>
      <TextareaField id="notes" label="Notes (optionnel)" />
      <FormAlert error={state.error} nonce={state.nonce} />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>Annuler</Button>
        <Button type="submit" loading={pending}>Créer la réservation</Button>
      </div>
    </form>
  );
}
