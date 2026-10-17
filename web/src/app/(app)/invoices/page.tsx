import { Receipt } from "lucide-react";
import { DbError } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireCtx } from "@/lib/ctx";
import { one } from "@/lib/format";
import { canEdit } from "@/lib/rbac";
import type { InvoiceStatus } from "@/types/db";
import { billingConfigured } from "@/lib/billing";
import { InvoicesClient, type InvoiceRow, type UnbilledContract } from "./InvoicesClient";

export const metadata = { title: "Factures" };

type Nest = {
  contract_no: string;
  bookings: { customers: { full_name: string } | { full_name: string }[] | null } | { customers: { full_name: string } | { full_name: string }[] | null }[] | null;
};

export default async function InvoicesPage() {
  const { supabase, role, currency } = await requireCtx("invoices");

  // Passe en « en retard » les factures échues (relance automatique : phase 4).
  await supabase.rpc("refresh_overdue_invoices");

  const [{ data, error }, closed] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, contract_id, invoice_no, amount_ht, amount_ttc, vat_rate, status, due_date, created_at, pdf_path, contracts(contract_no, bookings(customers(full_name))), payments(amount)")
      .order("created_at", { ascending: false }),
    // Contrats clôturés : ceux sans facture active n'ont pas (encore) été facturés par le billing-service.
    supabase
      .from("contracts")
      .select("id, contract_no, closed_at, invoices(status), bookings(total_amount, customers(full_name))")
      .not("closed_at", "is", null)
      .order("closed_at", { ascending: false })
      .limit(100),
  ]);

  type ClosedRow = {
    id: string; contract_no: string; closed_at: string; invoices: { status: string }[] | { status: string } | null;
    bookings: { total_amount: number; customers: { full_name: string } | { full_name: string }[] | null } | { total_amount: number; customers: { full_name: string } | { full_name: string }[] | null }[] | null;
  };
  const unbilled: UnbilledContract[] = ((closed.data ?? []) as unknown as ClosedRow[])
    .filter((c) => {
      const inv = Array.isArray(c.invoices) ? c.invoices : c.invoices ? [c.invoices] : [];
      return !inv.some((i) => i.status !== "annulee");
    })
    .map((c) => {
      const b = one(c.bookings);
      return { id: c.id, contract_no: c.contract_no, closed_at: c.closed_at, customer: one(b?.customers ?? null)?.full_name ?? "—", total: Number(b?.total_amount ?? 0) };
    });

  const rows: InvoiceRow[] = (data ?? []).map((i) => {
    const c = one(i.contracts as unknown as Nest | Nest[] | null);
    const b = one(c?.bookings ?? null);
    const paid = ((i.payments as { amount: number }[] | null) ?? []).reduce((s, p) => s + Number(p.amount), 0);
    return {
      id: i.id as string,
      contract_id: i.contract_id as string,
      invoice_no: i.invoice_no as string,
      contract_no: c?.contract_no ?? "—",
      customer: one(b?.customers ?? null)?.full_name ?? "—",
      amount_ht: Number(i.amount_ht),
      amount_ttc: Number(i.amount_ttc),
      paid,
      pdf: Boolean(i.pdf_path),
      status: i.status as InvoiceStatus,
      due_date: i.due_date as string,
    };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader icon={Receipt} title="Factures" description="Factures de location, paiements et suivi des retards." />
      {error ? (
        <DbError message={error.message} />
      ) : (
        <InvoicesClient
          rows={rows}
          unbilled={unbilled}
          currency={currency}
          canPay={canEdit(role, "payments")}
          canCancel={canEdit(role, "invoices")}
          canBill={canEdit(role, "billing")}
          billingEnabled={billingConfigured()}
        />
      )}
    </div>
  );
}
