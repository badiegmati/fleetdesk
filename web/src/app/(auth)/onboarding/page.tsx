import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./OnboardingForm";

export const metadata = { title: "Création de la société" };

export default async function OnboardingPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  // Un utilisateur déjà rattaché à une société ne peut pas revenir ici.
  if (current.profile?.company_id) redirect("/dashboard");

  // Utilisateur invité par un administrateur : rattachement automatique à sa société.
  const supabase = await createClient();
  const { data: joined } = await supabase.rpc("accept_invitation");
  if (joined) redirect("/dashboard");

  return <OnboardingForm />;
}
