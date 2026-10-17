import { Sparkles } from "lucide-react";
import { DbError } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireCtx } from "@/lib/ctx";
import { canEdit } from "@/lib/rbac";
import type { Agency, Category } from "@/types/db";
import { AssistantClient } from "./AssistantClient";

export const metadata = { title: "Assistant IA" };

export default async function AssistantPage() {
  const { supabase, role, currency } = await requireCtx("assistant");
  const [agencies, categories] = await Promise.all([
    supabase.from("agencies").select("id, name, city, address, phone").order("name"),
    supabase.from("vehicle_categories").select("id, name, daily_rate").order("daily_rate"),
  ]);
  const error = agencies.error ?? categories.error;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        icon={Sparkles}
        title="Assistant"
        description="Trouve les véhicules libres et obtiens un tarif suggéré selon la demande prévue."
      />
      {error ? (
        <DbError message={error.message} />
      ) : (
        <AssistantClient
          agencies={(agencies.data ?? []) as Agency[]}
          categories={(categories.data ?? []) as Category[]}
          canBook={canEdit(role, "bookings")}
          currency={currency}
        />
      )}
    </div>
  );
}
