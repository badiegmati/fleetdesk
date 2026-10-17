import { Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DbError } from "@/components/ui/empty-state";
import { requireCtx } from "@/lib/ctx";
import { canEdit } from "@/lib/rbac";
import { CustomersClient, type CustomerRow } from "./CustomersClient";

export const metadata = { title: "Clients" };

export default async function CustomersPage() {
  const { supabase, role } = await requireCtx("customers");
  const { data, error } = await supabase
    .from("customers")
    .select("id, full_name, email, phone, license_no, created_at, bookings(count)")
    .order("full_name");

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader icon={Users} title="Clients" description="Fichier clients, permis et historique de location." />
      {error ? (
        <DbError message={error.message} />
      ) : (
        <CustomersClient customers={(data ?? []) as unknown as CustomerRow[]} canEdit={canEdit(role, "customers")} />
      )}
    </div>
  );
}
