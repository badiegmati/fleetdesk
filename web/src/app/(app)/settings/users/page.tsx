import { DbError } from "@/components/ui/empty-state";
import { requireCtx } from "@/lib/ctx";
import type { Agency, Member } from "@/types/db";
import { UsersClient, type InvitationRow } from "./UsersClient";

export const metadata = { title: "Utilisateurs" };

export default async function UsersSettingsPage() {
  const { supabase, user } = await requireCtx("settings");
  const [members, invitations, agencies] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, agency_id").order("created_at"),
    supabase
      .from("invitations")
      .select("id, email, role, agency_id, created_at, expires_at")
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("agencies").select("id, name, city, address, phone").order("name"),
  ]);
  const error = members.error ?? invitations.error ?? agencies.error;
  if (error) return <DbError message={error.message} />;

  return (
    <UsersClient
      meId={user.id}
      members={(members.data ?? []) as Member[]}
      invitations={(invitations.data ?? []) as InvitationRow[]}
      agencies={(agencies.data ?? []) as Agency[]}
    />
  );
}
