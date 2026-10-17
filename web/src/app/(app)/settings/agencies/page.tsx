import { DbError } from "@/components/ui/empty-state";
import { requireCtx } from "@/lib/ctx";
import { AgenciesClient } from "./AgenciesClient";
import type { Agency } from "@/types/db";

export const metadata = { title: "Agences" };

export default async function AgenciesSettingsPage() {
  const { supabase } = await requireCtx("settings");
  const { data, error } = await supabase
    .from("agencies")
    .select("id, name, city, address, phone, vehicles(count)")
    .order("name");
  if (error) return <DbError message={error.message} />;
  return <AgenciesClient agencies={(data ?? []) as unknown as (Agency & { vehicles: { count: number }[] })[]} />;
}
