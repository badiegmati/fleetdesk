import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can, toRole, type Role, type Section } from "@/lib/rbac";

/** Utilisateur connecté + profil (mémorisé pendant la durée d'une requête). */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, company_id")
    .eq("id", user.id)
    .maybeSingle();

  return { user, profile };
});

/**
 * Garde d'accès côté serveur pour une section de l'application.
 * Redirige vers /login, /onboarding ou /dashboard selon la situation.
 */
export async function requireSection(section: Section): Promise<Role> {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (!current.profile?.company_id) redirect("/onboarding");

  const role = toRole(current.profile.role);
  if (!can(role, section)) redirect("/dashboard");
  return role;
}
