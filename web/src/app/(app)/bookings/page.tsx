import { CalendarDays } from "lucide-react";
import { DbError } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireCtx } from "@/lib/ctx";
import { canEdit } from "@/lib/rbac";
import { dayKey, one } from "@/lib/format";
import type { Agency, BookingStatus, Customer, VehicleStatus } from "@/types/db";
import { BookingsClient, type BookingRow, type VehicleOpt } from "./BookingsClient";

export const metadata = { title: "Réservations" };

type SP = { start?: string; agency?: string; vehicle?: string; from?: string; to?: string };

const addDays = (key: string, n: number) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export default async function BookingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase, role, currency } = await requireCtx("bookings");

  const todayKey = dayKey(new Date());
  const startKey = /^\d{4}-\d{2}-\d{2}$/.test(sp.start ?? "") ? sp.start! : addDays(todayKey, -1);
  const winFrom = `${addDays(startKey, -1)}T00:00:00Z`;
  const winTo = `${addDays(startKey, 15)}T00:00:00Z`;

  const select =
    "id, vehicle_id, customer_id, agency_id, start_at, end_at, status, daily_rate, total_amount, notes, is_ai_draft, customers(full_name), vehicles(plate, brand, model), contracts(id)";

  const [vehicles, customers, agencies, windowed, upcoming] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, plate, brand, model, agency_id, status, vehicle_categories(daily_rate)")
      .neq("status", "hors_service")
      .order("plate"),
    supabase.from("customers").select("id, full_name, email, phone, license_no").order("full_name"),
    supabase.from("agencies").select("id, name, city, address, phone").order("name"),
    supabase
      .from("bookings")
      .select(select)
      .neq("status", "cancelled")
      .lt("start_at", winTo)
      .gt("end_at", winFrom),
    supabase
      .from("bookings")
      .select(select)
      .in("status", ["pending", "confirmed", "active"])
      .order("start_at")
      .limit(60),
  ]);

  const error = vehicles.error ?? customers.error ?? agencies.error ?? windowed.error ?? upcoming.error;

  const vehicleOpts: VehicleOpt[] = (vehicles.data ?? []).map((v) => ({
    id: v.id as string,
    plate: v.plate as string,
    label: `${v.brand} ${v.model}`,
    agency_id: v.agency_id as string,
    status: v.status as VehicleStatus,
    rate: one(v.vehicle_categories as { daily_rate: number } | { daily_rate: number }[] | null)?.daily_rate ?? 0,
  }));

  const toRow = (b: Record<string, unknown>): BookingRow => ({
    id: b.id as string,
    vehicle_id: b.vehicle_id as string,
    customer_id: b.customer_id as string,
    start_at: b.start_at as string,
    end_at: b.end_at as string,
    status: b.status as BookingStatus,
    total_amount: Number(b.total_amount ?? 0),
    customer: one(b.customers as { full_name: string } | { full_name: string }[] | null)?.full_name ?? "—",
    vehicle: (() => {
      const v = one(b.vehicles as { plate: string; brand: string; model: string } | { plate: string; brand: string; model: string }[] | null);
      return v ? `${v.brand} ${v.model} · ${v.plate}` : "—";
    })(),
    aiDraft: Boolean(b.is_ai_draft),
    contractId: one(b.contracts as { id: string } | { id: string }[] | null)?.id ?? null,
  });

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <PageHeader
        icon={CalendarDays}
        title="Réservations"
        description="Calendrier par véhicule, mis à jour en direct. Deux réservations ne peuvent jamais se chevaucher."
      />
      {error ? (
        <DbError message={error.message} />
      ) : (
        <BookingsClient
          vehicles={vehicleOpts}
          customers={(customers.data ?? []) as Customer[]}
          agencies={(agencies.data ?? []) as Agency[]}
          windowBookings={(windowed.data ?? []).map((b) => toRow(b as Record<string, unknown>))}
          upcoming={(upcoming.data ?? []).map((b) => toRow(b as Record<string, unknown>))}
          startKey={startKey}
          todayKey={todayKey}
          agencyFilter={sp.agency ?? "all"}
          canEdit={canEdit(role, "bookings")}
          canContract={canEdit(role, "contracts")}
          currency={currency}
          prefill={sp.vehicle ? { vehicleId: sp.vehicle, from: sp.from, to: sp.to } : null}
        />
      )}
    </div>
  );
}
