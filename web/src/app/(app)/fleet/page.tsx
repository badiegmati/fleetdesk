import { Car } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DbError } from "@/components/ui/empty-state";
import { requireCtx } from "@/lib/ctx";
import { canEdit } from "@/lib/rbac";
import type { Agency, Category } from "@/types/db";
import { FleetClient, type VehicleRow } from "./FleetClient";

export const metadata = { title: "Flotte" };

export default async function FleetPage() {
  const { supabase, role } = await requireCtx("fleet");

  const [vehicles, agencies, categories] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, agency_id, category_id, plate, brand, model, year, mileage_km, status, agencies(name), vehicle_categories(name, daily_rate)")
      .order("plate"),
    supabase.from("agencies").select("id, name, city, address, phone").order("name"),
    supabase.from("vehicle_categories").select("id, name, daily_rate").order("daily_rate"),
  ]);

  const error = vehicles.error ?? agencies.error ?? categories.error;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader icon={Car} title="Flotte" description="Véhicules de tes agences, statuts et kilométrage." />
      {error ? (
        <DbError message={error.message} />
      ) : (
        <FleetClient
          vehicles={(vehicles.data ?? []) as unknown as VehicleRow[]}
          agencies={(agencies.data ?? []) as Agency[]}
          categories={(categories.data ?? []) as Category[]}
          canEdit={canEdit(role, "fleet")}
        />
      )}
    </div>
  );
}
