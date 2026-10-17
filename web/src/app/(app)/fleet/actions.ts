"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCtx } from "@/lib/ctx";
import { canEdit } from "@/lib/rbac";
import { dbError, fail, ok, num, opt, str, type FormState } from "@/lib/form";

const schema = z.object({
  plate: z.string().min(2, "Immatriculation requise").max(20),
  brand: z.string().min(1, "Marque requise"),
  model: z.string().min(1, "Modèle requis"),
  year: z.number().int("Année invalide").min(1990, "Année invalide").max(2100, "Année invalide").nullable(),
  mileage_km: z.number().int("Kilométrage invalide").min(0, "Kilométrage invalide"),
  agency_id: z.string().uuid("Choisis une agence"),
  category_id: z.string().uuid().nullable(),
  status: z.enum(["disponible", "loue", "maintenance", "hors_service"]),
});

export async function saveVehicle(_p: FormState, fd: FormData): Promise<FormState> {
  const { supabase, role } = await getCtx();
  if (!canEdit(role, "fleet")) return fail("Seuls l'administrateur et le gestionnaire peuvent modifier la flotte.");

  const parsed = schema.safeParse({
    plate: str(fd, "plate").toUpperCase(),
    brand: str(fd, "brand"),
    model: str(fd, "model"),
    year: num(fd, "year"),
    mileage_km: num(fd, "mileage_km") ?? 0,
    agency_id: str(fd, "agency_id"),
    category_id: opt(fd, "category_id"),
    status: str(fd, "status") || "disponible",
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const id = str(fd, "id");
  if (id) {
    const { data, error } = await supabase.from("vehicles").update(parsed.data).eq("id", id).select("id");
    if (error) return fail(dbError(error));
    if (!data?.length) return fail("Véhicule introuvable ou modification non autorisée.");
  } else {
    const { error } = await supabase.from("vehicles").insert(parsed.data);
    if (error) return fail(dbError(error));
  }
  revalidatePath("/fleet");
  revalidatePath("/dashboard");
  return ok();
}

export async function deleteVehicle(id: string): Promise<FormState> {
  const { supabase, role } = await getCtx();
  if (!canEdit(role, "fleet")) return fail("Action non autorisée.");
  const { data, error } = await supabase.from("vehicles").delete().eq("id", id).select("id");
  if (error) {
    return fail(
      error.code === "23503"
        ? "Suppression impossible : des réservations utilisent ce véhicule. Passe-le plutôt en « hors service »."
        : dbError(error),
    );
  }
  if (!data?.length) return fail("Véhicule introuvable ou suppression non autorisée.");
  revalidatePath("/fleet");
  return ok();
}
