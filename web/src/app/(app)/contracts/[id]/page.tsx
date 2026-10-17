import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DbError } from "@/components/ui/empty-state";
import { requireCtx } from "@/lib/ctx";
import { canEdit } from "@/lib/rbac";
import { one } from "@/lib/format";
import { ContractPanel, type ContractData, type InspectionData } from "./ContractPanel";

export const metadata = { title: "Contrat" };

type Veh = { plate: string; brand: string; model: string; mileage_km: number };
type Cus = { full_name: string; email: string | null; phone: string | null; license_no: string | null };
type Bk = {
  start_at: string; end_at: string; daily_rate: number; total_amount: number;
  vehicles: Veh | Veh[] | null; customers: Cus | Cus[] | null;
};

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, role, currency, companyId } = await requireCtx("contracts");

  const { data: c, error } = await supabase
    .from("contracts")
    .select("id, contract_no, signed_at, signed_by, deposit, closed_at, bookings(start_at, end_at, daily_rate, total_amount, vehicles(plate, brand, model, mileage_km), customers(full_name, email, phone, license_no))")
    .eq("id", id)
    .maybeSingle();
  if (error) return <DbError message={error.message} />;
  if (!c) notFound();

  const [inspections, invoices] = await Promise.all([
    supabase.from("inspections").select("type, mileage_km, fuel_level, notes, photo_paths, ai_findings, created_at").eq("contract_id", id),
    supabase.from("invoices").select("id, invoice_no, status, amount_ttc").eq("contract_id", id),
  ]);

  // Miniatures : URL signées (bucket privé, 1 h).
  const allPaths = (inspections.data ?? []).flatMap((i) => (i.photo_paths as string[] | null) ?? []);
  const signed = allPaths.length
    ? await supabase.storage.from("inspections").createSignedUrls(allPaths, 3600)
    : { data: [] as { path: string | null; signedUrl: string }[] };
  const urlByPath = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
  const insp: InspectionData[] = (inspections.data ?? []).map((i) => ({
    type: i.type as "depart" | "retour",
    mileage_km: i.mileage_km as number | null,
    fuel_level: i.fuel_level as number | null,
    notes: i.notes as string | null,
    created_at: i.created_at as string,
    photos: ((i.photo_paths as string[] | null) ?? []).map((p) => ({ path: p, url: urlByPath.get(p) ?? "" })).filter((p) => p.url),
    ai_findings: (i.ai_findings as InspectionData["ai_findings"]) ?? null,
  }));

  const b = one(c.bookings as unknown as Bk | Bk[] | null);
  const data: ContractData = {
    id: c.id as string,
    contract_no: c.contract_no as string,
    signed_at: c.signed_at as string | null,
    signed_by: c.signed_by as string | null,
    closed_at: c.closed_at as string | null,
    deposit: Number(c.deposit ?? 0),
    start_at: b?.start_at ?? "",
    end_at: b?.end_at ?? "",
    daily_rate: Number(b?.daily_rate ?? 0),
    total: Number(b?.total_amount ?? 0),
    vehicle: one(b?.vehicles ?? null),
    customer: one(b?.customers ?? null),
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/contracts" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-white">
        <ArrowLeft size={15} aria-hidden="true" /> Retour aux contrats
      </Link>
      <ContractPanel
        contract={data}
        inspections={insp}
        companyId={companyId}
        invoice={(invoices.data?.[0] as { id: string; invoice_no: string; status: string; amount_ttc: number } | undefined) ?? null}
        canEdit={canEdit(role, "contracts")}
        currency={currency}
      />
    </div>
  );
}
