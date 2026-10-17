"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCtx } from "@/lib/ctx";
import { canEdit } from "@/lib/rbac";
import { dbError, fail, ok, opt, str, type FormState } from "@/lib/form";

const schema = z.object({
  full_name: z.string().min(2, "Nom complet requis"),
  email: z.string().email("E-mail invalide").nullable(),
  phone: z.string().max(30).nullable(),
  license_no: z.string().max(40).nullable(),
});

export async function saveCustomer(_p: FormState, fd: FormData): Promise<FormState> {
  const { supabase, role } = await getCtx();
  if (!canEdit(role, "customers")) return fail("Ton rôle ne permet pas de modifier les clients.");

  const parsed = schema.safeParse({
    full_name: str(fd, "full_name"),
    email: opt(fd, "email"),
    phone: opt(fd, "phone"),
    license_no: opt(fd, "license_no"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const id = str(fd, "id");
  if (id) {
    const { data, error } = await supabase.from("customers").update(parsed.data).eq("id", id).select("id");
    if (error) return fail(dbError(error));
    if (!data?.length) return fail("Client introuvable ou modification non autorisée.");
  } else {
    const { error } = await supabase.from("customers").insert(parsed.data);
    if (error) return fail(dbError(error));
  }
  revalidatePath("/customers");
  return ok();
}

export async function deleteCustomer(id: string): Promise<FormState> {
  const { supabase, role } = await getCtx();
  if (!canEdit(role, "customers")) return fail("Action non autorisée.");
  const { data, error } = await supabase.from("customers").delete().eq("id", id).select("id");
  if (error) {
    return fail(error.code === "23503" ? "Suppression impossible : ce client a des réservations." : dbError(error));
  }
  if (!data?.length) return fail("Client introuvable ou suppression non autorisée.");
  revalidatePath("/customers");
  return ok();
}
