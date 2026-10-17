import { FileText } from "lucide-react";
import { DbError } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireCtx } from "@/lib/ctx";
import { one } from "@/lib/format";
import { ContractsClient, type ContractRow } from "./ContractsClient";

export const metadata = { title: "Contrats" };

type B = {
  start_at: string; end_at: string; total_amount: number;
  customers: { full_name: string } | { full_name: string }[] | null;
  vehicles: { plate: string; brand: string; model: string } | { plate: string; brand: string; model: string }[] | null;
};

export default async function ContractsPage() {
  const { supabase, currency } = await requireCtx("contracts");
  const { data, error } = await supabase
    .from("contracts")
    .select("id, contract_no, signed_at, closed_at, deposit, created_at, bookings(start_at, end_at, total_amount, customers(full_name), vehicles(plate, brand, model))")
    .order("created_at", { ascending: false });

  const rows: ContractRow[] = (data ?? []).map((c) => {
    const b = one(c.bookings as unknown as B | B[] | null);
    const v = one(b?.vehicles ?? null);
    return {
      id: c.id as string,
      contract_no: c.contract_no as string,
      signed_at: c.signed_at as string | null,
      closed_at: c.closed_at as string | null,
      customer: one(b?.customers ?? null)?.full_name ?? "—",
      vehicle: v ? `${v.brand} ${v.model} · ${v.plate}` : "—",
      start_at: b?.start_at ?? "",
      end_at: b?.end_at ?? "",
      total: Number(b?.total_amount ?? 0),
    };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader icon={FileText} title="Contrats" description="Contrats de location, signature et états des lieux départ / retour." />
      {error ? <DbError message={error.message} /> : <ContractsClient rows={rows} currency={currency} />}
    </div>
  );
}
