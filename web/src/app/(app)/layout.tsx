import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentUser } from "@/lib/auth";
import { toRole } from "@/lib/rbac";
import { ToastProvider } from "@/components/ui/toast";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (!current.profile?.company_id) redirect("/onboarding");

  const role = toRole(current.profile.role);
  const name = current.profile.full_name ?? current.user.email ?? "Utilisateur";

  return (
    <ToastProvider>
      <AppShell role={role} name={name}>
        {children}
      </AppShell>
    </ToastProvider>
  );
}
