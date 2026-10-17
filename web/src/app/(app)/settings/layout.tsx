import { Settings } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { requireCtx } from "@/lib/ctx";
import { SettingsTabs } from "./SettingsTabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireCtx("settings");
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader icon={Settings} title="Paramètres" description="Agences, utilisateurs, rôles et tarifs de ta société." />
      <SettingsTabs />
      {children}
    </div>
  );
}
