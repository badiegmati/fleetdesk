import { Wrench } from "lucide-react";
import { DbError } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireCtx } from "@/lib/ctx";
import { dayKey, one } from "@/lib/format";
import { canEdit } from "@/lib/rbac";
import type { MaintenanceType } from "@/types/db";
import { MaintenanceClient, type AlertRow, type MaintRow } from "./MaintenanceClient";

export const metadata = { title: "Maintenance" };

export default async function MaintenancePage() {
  const { supabase, role, currency } = await requireCtx("maintenance");
  const today = dayKey(new Date());

  const [records, vehicles] = await Promise.all([
    supabase
      .from("maintenance_records")
      .select("id, vehicle_id, type, description, start_date, end_date, cost, vehicles(plate, brand, model)")
      .order("start_date", { ascending: false })
      .limit(100),
    supabase.from("vehicles").select("id, plate, brand, model, mileage_km, status").neq("status", "hors_service").order("plate"),
  ]);
  const error = records.error ?? vehicles.error;

  const rows: MaintRow[] = (records.data ?? []).map((m) => {
    const v = one(m.vehicles as { plate: string; brand: string; model: string } | { plate: string; brand: string; model: string }[] | null);
    return {
      id: m.id as string,
      vehicle_id: m.vehicle_id as string,
      vehicle: v ? `${v.brand} ${v.model} · ${v.plate}` : "—",
      type: m.type as MaintenanceType,
      description: m.description as string | null,
      start_date: m.start_date as string,
      end_date: m.end_date as string | null,
      cost: m.cost as number | null,
      ongoing: (m.start_date as string) <= today && (!m.end_date || (m.end_date as string) >= today),
    };
  });

  // Alertes déterministes : > 10 000 km et aucune intervention préventive depuis 180 jours.
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() - 180);
  const limitKey = limit.toISOString().slice(0, 10);
  const alerts: AlertRow[] = (vehicles.data ?? [])
    .filter((v) => v.mileage_km > 10_000 && !(records.data ?? []).some((m) => m.vehicle_id === v.id && m.type === "preventive" && (m.start_date as string) >= limitKey))
    .map((v) => ({ id: v.id as string, label: `${v.brand} ${v.model} · ${v.plate}`, km: v.mileage_km as number }))
    .slice(0, 6);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader icon={Wrench} title="Maintenance" description="Entretien, immobilisations et alertes. Un véhicule en maintenance ne peut pas être réservé sur la période." />
      {error ? (
        <DbError message={error.message} />
      ) : (
        <MaintenanceClient
          rows={rows}
          alerts={alerts}
          vehicles={(vehicles.data ?? []).map((v) => ({ id: v.id as string, label: `${v.brand} ${v.model} · ${v.plate}` }))}
          canEdit={canEdit(role, "maintenance")}
          currency={currency}
          today={today}
        />
      )}
    </div>
  );
}
