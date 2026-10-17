import { DbError } from "@/components/ui/empty-state";
import { requireCtx } from "@/lib/ctx";
import type { Category } from "@/types/db";
import { RatesClient } from "./RatesClient";

export const metadata = { title: "Tarifs" };

export default async function RatesPage() {
  const { supabase, currency } = await requireCtx("settings");
  const { data, error } = await supabase.from("vehicle_categories").select("id, name, daily_rate").order("daily_rate");
  if (error) return <DbError message={error.message} />;
  return <RatesClient categories={(data ?? []) as Category[]} currency={currency} />;
}
