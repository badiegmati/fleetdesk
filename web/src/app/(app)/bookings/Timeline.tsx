"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BookingStatus } from "@/types/db";
import type { BookingRow, VehicleOpt } from "./BookingsClient";

const DAYS = 14;
const DAY_MS = 86_400_000;
const WEEKDAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

const BAR: Record<BookingStatus, string> = {
  pending: "bg-brand-violet/70 border-brand-violet",
  confirmed: "bg-brand-blue/70 border-brand-blue",
  active: "bg-brand-cyan/70 border-brand-cyan",
  completed: "bg-white/15 border-white/25",
  cancelled: "hidden",
};

const utc = (key: string) => new Date(`${key}T00:00:00Z`).getTime();
const keyOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

type Props = {
  vehicles: VehicleOpt[];
  bookings: BookingRow[];
  startKey: string;
  todayKey: string;
  agencyParam: string;
  canEdit: boolean;
  onPickCell: (vehicleId: string, dayKey: string) => void;
};

/** Vue timeline : une ligne par véhicule, 14 jours, barres de réservation animées. */
export function Timeline({ vehicles, bookings, startKey, todayKey, agencyParam, canEdit, onPickCell }: Props) {
  const t0 = utc(startKey);
  const total = DAYS * DAY_MS;
  const days = Array.from({ length: DAYS }, (_, i) => keyOf(t0 + i * DAY_MS));
  const agencyQs = agencyParam !== "all" ? `&agency=${agencyParam}` : "";
  const nav = (offset: number) => `/bookings?start=${keyOf(t0 + offset * DAY_MS)}${agencyQs}`;

  const byVehicle = new Map<string, BookingRow[]>();
  for (const b of bookings) {
    const list = byVehicle.get(b.vehicle_id) ?? [];
    list.push(b);
    byVehicle.set(b.vehicle_id, list);
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-1">
          <Link href={nav(-7)} aria-label="Semaine précédente" className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue">
            <ChevronLeft size={18} />
          </Link>
          <Link href={`/bookings?start=${keyOf(utc(todayKey) - DAY_MS)}${agencyQs}`} className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue">
            Aujourd&apos;hui
          </Link>
          <Link href={nav(7)} aria-label="Semaine suivante" className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue">
            <ChevronRight size={18} />
          </Link>
        </div>
        <ul className="hidden items-center gap-3 text-xs text-muted sm:flex" aria-label="Légende">
          <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand-violet" />En attente</li>
          <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand-blue" />Confirmée</li>
          <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand-cyan" />En cours</li>
        </ul>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[880px]">
          <div className="grid grid-cols-[180px_1fr] border-b border-border">
            <div className="px-4 py-2 text-xs font-medium text-muted">Véhicule</div>
            <div className="grid" style={{ gridTemplateColumns: `repeat(${DAYS}, minmax(0, 1fr))` }}>
              {days.map((d) => {
                const date = new Date(`${d}T00:00:00Z`);
                const isToday = d === todayKey;
                return (
                  <div key={d} className={cn("border-l border-border py-1.5 text-center text-[11px]", isToday ? "bg-brand-blue/10 text-white" : "text-muted")}>
                    <div>{WEEKDAYS[date.getUTCDay()]}</div>
                    <div className="font-semibold">{date.getUTCDate()}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {vehicles.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted">Aucun véhicule à afficher pour cette agence.</p>
          )}

          {vehicles.map((v) => (
            <div key={v.id} className="grid grid-cols-[180px_1fr] border-b border-border/60 last:border-b-0">
              <div className="flex flex-col justify-center px-4 py-2">
                <span className="truncate text-sm font-medium">{v.label}</span>
                <span className="font-mono text-[11px] text-muted">{v.plate}</span>
              </div>
              <div className="relative h-12">
                <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${DAYS}, minmax(0, 1fr))` }}>
                  {days.map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => onPickCell(v.id, d)}
                      aria-label={`Réserver ${v.label} le ${d}`}
                      className={cn(
                        "border-l border-border/60 transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
                        d === todayKey && "bg-brand-blue/[0.06]",
                        canEdit && "hover:bg-white/[0.06]",
                      )}
                    />
                  ))}
                </div>
                {(byVehicle.get(v.id) ?? []).map((b) => {
                  const s = Math.max(new Date(b.start_at).getTime(), t0);
                  const e = Math.min(new Date(b.end_at).getTime(), t0 + total);
                  if (e <= s) return null;
                  return (
                    <motion.div
                      key={b.id}
                      initial={{ opacity: 0, scaleX: 0.7 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      style={{ left: `${((s - t0) / total) * 100}%`, width: `${((e - s) / total) * 100}%`, originX: 0 }}
                      title={`${b.customer} — ${new Date(b.start_at).toLocaleDateString("fr-FR", { timeZone: "Africa/Tunis" })} → ${new Date(b.end_at).toLocaleDateString("fr-FR", { timeZone: "Africa/Tunis" })}`}
                      className={cn(
                        "pointer-events-none absolute inset-y-2 flex items-center overflow-hidden rounded-lg border px-2 text-[11px] font-medium text-white shadow-md",
                        BAR[b.status],
                      )}
                    >
                      <span className="truncate">{b.customer}</span>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {canEdit && <p className="border-t border-border px-4 py-2 text-xs text-muted">Clique sur une case libre pour créer une réservation à cette date.</p>}
    </Card>
  );
}
