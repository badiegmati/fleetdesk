import { LayoutDashboard } from "lucide-react";
import { DbError } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireCtx } from "@/lib/ctx";
import { dayKey, one } from "@/lib/format";
import { DashboardView, type DayPoint, type ForecastPoint, type TodayItem } from "./DashboardView";

export const metadata = { title: "Dashboard" };

type Row = {
  id: string; start_at: string; end_at: string; status: string; total_amount: number;
  customers: { full_name: string } | { full_name: string }[] | null;
  vehicles: { plate: string; brand: string; model: string } | { plate: string; brand: string; model: string }[] | null;
};

const shiftKey = (key: string, n: number) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export default async function DashboardPage() {
  const { supabase, role, currency } = await requireCtx("dashboard");
  const now = new Date();
  const today = dayKey(now);
  const monthStartKey = `${today.slice(0, 8)}01`;

  const [vehicles, near, month, history, forecasts] = await Promise.all([
    supabase.from("vehicles").select("id, status"),
    supabase
      .from("bookings")
      .select("id, start_at, end_at, status, total_amount, customers(full_name), vehicles(plate, brand, model)")
      .neq("status", "cancelled")
      .gte("end_at", `${shiftKey(today, -9)}T00:00:00Z`)
      .lte("start_at", `${shiftKey(today, 9)}T23:59:59Z`),
    supabase
      .from("bookings")
      .select("total_amount")
      .in("status", ["confirmed", "active", "completed"])
      .gte("start_at", `${monthStartKey}T00:00:00+01:00`),
    // Demande réelle : réservations (hors annulées) par jour de départ, 14 derniers jours.
    supabase
      .from("bookings")
      .select("start_at")
      .neq("status", "cancelled")
      .gte("start_at", `${shiftKey(today, -14)}T00:00:00+01:00`)
      .lte("start_at", `${today}T23:59:59+01:00`),
    // Prévision nocturne (Edge Function forecast-demand, lissage de Holt-Winters), toutes catégories.
    supabase
      .from("demand_forecasts")
      .select("forecast_date, predicted, lower_bound, upper_bound")
      .is("category_id", null)
      .gte("forecast_date", today)
      .lte("forecast_date", shiftKey(today, 14)),
  ]);
  const error = vehicles.error ?? near.error ?? month.error ?? history.error ?? forecasts.error;
  if (error) {
    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <PageHeader icon={LayoutDashboard} title="Dashboard" description="Vue d'ensemble de ta flotte, de tes réservations et de ton chiffre d'affaires." />
        <DbError message={error.message} />
      </div>
    );
  }

  const fleet = vehicles.data ?? [];
  const usable = fleet.filter((v) => v.status !== "hors_service").length;
  const rented = fleet.filter((v) => v.status === "loue").length;
  const inMaintenance = fleet.filter((v) => v.status === "maintenance").length;
  const rows = (near.data ?? []) as unknown as Row[];
  const counted = rows.filter((b) => ["confirmed", "active", "completed"].includes(b.status));

  const item = (b: Row): TodayItem => {
    const v = one(b.vehicles);
    return {
      id: b.id,
      customer: one(b.customers)?.full_name ?? "—",
      vehicle: v ? `${v.brand} ${v.model} · ${v.plate}` : "—",
      at: b.status === "active" || b.end_at ? b.end_at : b.start_at,
    };
  };
  const returns = rows.filter((b) => b.status === "active" && dayKey(b.end_at) === today).map(item);
  const departures = rows
    .filter((b) => (b.status === "confirmed" || b.status === "pending") && dayKey(b.start_at) === today)
    .map((b) => ({ ...item(b), at: b.start_at }));

  const series: DayPoint[] = Array.from({ length: 15 }, (_, i) => {
    const key = shiftKey(today, i - 7);
    const occupied = counted.filter((b) => dayKey(b.start_at) <= key && dayKey(b.end_at) >= key).length;
    const rate = usable ? Math.min(100, Math.round((occupied / usable) * 100)) : 0;
    const d = new Date(`${key}T00:00:00Z`);
    return {
      label: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: "UTC" }),
      reel: key <= today ? rate : null,
      prevu: key >= today ? rate : null,
    };
  });

  // Courbe « réel vs prévu » : somme des prévisions de toutes les agences, par jour.
  const actual = new Map<string, number>();
  for (const b of history.data ?? []) actual.set(dayKey(b.start_at as string), (actual.get(dayKey(b.start_at as string)) ?? 0) + 1);
  const byDate = new Map<string, { p: number; lo: number; hi: number }>();
  for (const r of forecasts.data ?? []) {
    const cur = byDate.get(r.forecast_date as string) ?? { p: 0, lo: 0, hi: 0 };
    cur.p += Number(r.predicted);
    cur.lo += Number(r.lower_bound ?? r.predicted);
    cur.hi += Number(r.upper_bound ?? r.predicted);
    byDate.set(r.forecast_date as string, cur);
  }
  const forecast: ForecastPoint[] | null = byDate.size
    ? Array.from({ length: 29 }, (_, i) => {
        const key = shiftKey(today, i - 14);
        const f = byDate.get(key);
        const d = new Date(`${key}T00:00:00Z`);
        return {
          label: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: "UTC" }),
          reel: key <= today ? (actual.get(key) ?? 0) : null,
          prevu: f ? Math.round(f.p * 10) / 10 : null,
          band: f ? ([Math.round(f.lo * 10) / 10, Math.round(f.hi * 10) / 10] as [number, number]) : null,
        };
      })
    : null;

  const revenue = (month.data ?? []).reduce((s, b) => s + Number(b.total_amount ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader icon={LayoutDashboard} title="Dashboard" description="Vue d'ensemble de ta flotte, de tes réservations et de ton chiffre d'affaires." />
      <DashboardView
        isEmpty={fleet.length === 0}
        isAdmin={role === "admin_societe"}
        kpis={{
          occupancy: usable ? Math.round((rented / usable) * 100) : 0,
          revenue,
          returns: returns.length,
          maintenance: inMaintenance,
          fleet: usable,
        }}
        series={series}
        forecast={forecast}
        returns={returns}
        departures={departures}
        currency={currency}
      />
    </div>
  );
}
