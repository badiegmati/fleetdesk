"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCtx } from "@/lib/ctx";
import { canEdit } from "@/lib/rbac";
import { dbError, fail, ok, num, opt, str, type FormState } from "@/lib/form";
import { dayKey } from "@/lib/format";

const schema = z
  .object({
    vehicle_id: z.string().uuid("Choisis un véhicule"),
    type: z.enum(["preventive", "corrective", "controle_technique"]),
    description: z.string().max(300).nullable(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de début invalide"),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de fin invalide").nullable(),
    cost: z.number("Coût invalide").min(0, "Coût invalide").nullable(),
  })
  .refine((v) => !v.end_date || v.end_date >= v.start_date, { message: "La fin doit être après le début", path: ["end_date"] });

export async function saveMaintenance(_p: FormState, fd: FormData): Promise<FormState> {
  const { supabase, role } = await getCtx();
  if (!canEdit(role, "maintenance")) return fail("Seuls l'administrateur et le gestionnaire planifient la maintenance.");
  const parsed = schema.safeParse({
    vehicle_id: str(fd, "vehicle_id"),
    type: str(fd, "type"),
    description: opt(fd, "description"),
    start_date: str(fd, "start_date"),
    end_date: opt(fd, "end_date"),
    cost: num(fd, "cost"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const { error } = await supabase.from("maintenance_records").insert(parsed.data);
  if (error) return fail(dbError(error));

  // Blocage automatique : si l'intervention est en cours aujourd'hui, le véhicule passe en « maintenance ».
  const today = dayKey(new Date());
  const active = parsed.data.start_date <= today && (!parsed.data.end_date || parsed.data.end_date >= today);
  if (active) {
    await supabase.from("vehicles").update({ status: "maintenance" }).eq("id", parsed.data.vehicle_id).neq("status", "loue");
  }
  revalidatePath("/maintenance");
  revalidatePath("/fleet");
  revalidatePath("/dashboard");
  return ok();
}

export async function finishMaintenance(id: string, vehicleId: string): Promise<FormState> {
  const { supabase, role } = await getCtx();
  if (!canEdit(role, "maintenance")) return fail("Action non autorisée.");
  const { error } = await supabase.from("maintenance_records").update({ end_date: dayKey(new Date()) }).eq("id", id);
  if (error) return fail(dbError(error));

  // Libère le véhicule s'il n'a plus d'autre intervention en cours.
  const { data: others } = await supabase
    .from("maintenance_records")
    .select("id")
    .eq("vehicle_id", vehicleId)
    .neq("id", id)
    .or(`end_date.is.null,end_date.gte.${dayKey(new Date())}`)
    .lte("start_date", dayKey(new Date()));
  if (!others?.length) {
    await supabase.from("vehicles").update({ status: "disponible" }).eq("id", vehicleId).eq("status", "maintenance");
  }
  revalidatePath("/maintenance");
  revalidatePath("/fleet");
  revalidatePath("/dashboard");
  return ok();
}
