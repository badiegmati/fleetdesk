import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Gauge, MapPin, Tag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DbError } from "@/components/ui/empty-state";
import { BookingBadge, VehicleBadge } from "@/components/ui/status-badge";
import { requireCtx } from "@/lib/ctx";
import { MAINTENANCE_TYPE, fmtDate, money, num, one } from "@/lib/format";
import type { BookingStatus, MaintenanceType, VehicleStatus } from "@/types/db";

export const metadata = { title: "Fiche véhicule" };

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, currency } = await requireCtx("fleet");

  const { data: v, error } = await supabase
    .from("vehicles")
    .select("id, plate, brand, model, year, mileage_km, status, agencies(name), vehicle_categories(name, daily_rate)")
    .eq("id", id)
    .maybeSingle();
  if (error) return <DbError message={error.message} />;
  if (!v) notFound();

  const [bookings, maintenance] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, start_at, end_at, status, total_amount, customers(full_name)")
      .eq("vehicle_id", id)
      .order("start_at", { ascending: false })
      .limit(15),
    supabase
      .from("maintenance_records")
      .select("id, type, description, start_date, end_date, cost")
      .eq("vehicle_id", id)
      .order("start_date", { ascending: false })
      .limit(15),
  ]);

  const agency = one(v.agencies as { name: string } | { name: string }[] | null);
  const cat = one(v.vehicle_categories as { name: string; daily_rate: number } | { name: string; daily_rate: number }[] | null);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/fleet" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-white">
        <ArrowLeft size={15} aria-hidden="true" /> Retour à la flotte
      </Link>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{v.brand} {v.model}</h1>
            <p className="mt-1 font-mono text-sm text-muted">{v.plate}{v.year ? ` · ${v.year}` : ""}</p>
          </div>
          <VehicleBadge status={v.status as VehicleStatus} />
        </div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
          <div className="flex items-center gap-2"><Gauge size={15} className="text-brand-cyan" aria-hidden="true" />{num(v.mileage_km)} km</div>
          <div className="flex items-center gap-2"><MapPin size={15} className="text-brand-cyan" aria-hidden="true" />{agency?.name ?? "—"}</div>
          <div className="flex items-center gap-2"><Tag size={15} className="text-brand-cyan" aria-hidden="true" />{cat ? `${cat.name} · ${money(cat.daily_rate, currency)}/jour` : "Sans catégorie"}</div>
        </dl>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Historique des locations</h2>
          {bookings.data?.length ? (
            <ul className="divide-y divide-border text-sm">
              {bookings.data.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p>{one(b.customers as { full_name: string } | { full_name: string }[] | null)?.full_name ?? "—"}</p>
                    <p className="text-xs text-muted">{fmtDate(b.start_at)} → {fmtDate(b.end_at)} · {money(b.total_amount, currency)}</p>
                  </div>
                  <BookingBadge status={b.status as BookingStatus} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Aucune location pour ce véhicule.</p>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Historique de maintenance</h2>
          {maintenance.data?.length ? (
            <ul className="divide-y divide-border text-sm">
              {maintenance.data.map((m) => (
                <li key={m.id} className="py-2.5">
                  <p>{MAINTENANCE_TYPE[m.type as MaintenanceType]}{m.description ? ` — ${m.description}` : ""}</p>
                  <p className="text-xs text-muted">
                    {fmtDate(m.start_date)} → {m.end_date ? fmtDate(m.end_date) : "en cours"}
                    {m.cost != null ? ` · ${money(m.cost, currency)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Aucune intervention enregistrée (ou accès non autorisé pour ton rôle).</p>
          )}
        </Card>
      </div>
    </div>
  );
}
