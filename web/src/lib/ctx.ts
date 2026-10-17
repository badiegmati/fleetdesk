import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can, toRole, type Role, type Section } from "@/lib/rbac";

/** Contexte de la requête : client Supabase (JWT de l'utilisateur → RLS), rôle, société. */
export const getCtx = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, company_id, agency_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.company_id) redirect("/onboarding");

  const { data: company } = await supabase
    .from("companies")
    .select("name, currency")
    .eq("id", profile.company_id)
    .maybeSingle();

  return {
    supabase,
    user,
    role: toRole(profile.role) as Role,
    companyId: profile.company_id as string,
    agencyId: (profile.agency_id as string | null) ?? null,
    currency: (company?.currency as string | undefined) ?? "TND",
    companyName: (company?.name as string | undefined) ?? "",
  };
});

export type Ctx = Awaited<ReturnType<typeof getCtx>>;

/** Garde de page : redirige si le rôle n'a pas accès à la section. */
export async function requireCtx(section: Section) {
  const ctx = await getCtx();
  if (!can(ctx.role, section)) redirect("/dashboard");
  return ctx;
}
