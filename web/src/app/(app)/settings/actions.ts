"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCtx } from "@/lib/ctx";
import { canEdit, ROLES } from "@/lib/rbac";
import { dbError, fail, ok, num, opt, str, type FormState } from "@/lib/form";

async function adminCtx() {
  const ctx = await getCtx();
  return canEdit(ctx.role, "settings") ? ctx : null;
}
const DENIED = "Réservé à l'administrateur de la société.";

// ── Agences ────────────────────────────────────────────────
const agencySchema = z.object({
  name: z.string().min(2, "Nom de l'agence requis"),
  city: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
});

export async function saveAgency(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await adminCtx();
  if (!ctx) return fail(DENIED);
  const parsed = agencySchema.safeParse({
    name: str(fd, "name"), city: opt(fd, "city"), address: opt(fd, "address"), phone: opt(fd, "phone"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const id = str(fd, "id");
  if (id) {
    const { data, error } = await ctx.supabase.from("agencies").update(parsed.data).eq("id", id).select("id");
    if (error) return fail(dbError(error));
    if (!data?.length) return fail("Agence introuvable.");
  } else {
    const { error } = await ctx.supabase.from("agencies").insert(parsed.data);
    if (error) return fail(dbError(error));
  }
  revalidatePath("/settings/agencies");
  return ok();
}

export async function deleteAgency(id: string): Promise<FormState> {
  const ctx = await adminCtx();
  if (!ctx) return fail(DENIED);
  const { data, error } = await ctx.supabase.from("agencies").delete().eq("id", id).select("id");
  if (error) {
    return fail(error.code === "23503" ? "Suppression impossible : cette agence contient des véhicules ou réservations." : dbError(error));
  }
  if (!data?.length) return fail("Agence introuvable.");
  revalidatePath("/settings/agencies");
  return ok();
}

// ── Tarifs (catégories) ────────────────────────────────────
const rateSchema = z.object({
  name: z.string().min(2, "Nom de catégorie requis"),
  daily_rate: z.number("Tarif invalide").min(0, "Tarif invalide"),
});

export async function saveCategory(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await adminCtx();
  if (!ctx) return fail(DENIED);
  const parsed = rateSchema.safeParse({ name: str(fd, "name"), daily_rate: num(fd, "daily_rate") });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const id = str(fd, "id");
  if (id) {
    const { data, error } = await ctx.supabase.from("vehicle_categories").update(parsed.data).eq("id", id).select("id");
    if (error) return fail(dbError(error));
    if (!data?.length) return fail("Catégorie introuvable.");
  } else {
    const { error } = await ctx.supabase.from("vehicle_categories").insert(parsed.data);
    if (error) return fail(dbError(error));
  }
  revalidatePath("/settings/rates");
  return ok();
}

export async function deleteCategory(id: string): Promise<FormState> {
  const ctx = await adminCtx();
  if (!ctx) return fail(DENIED);
  const { error } = await ctx.supabase.from("vehicle_categories").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath("/settings/rates");
  return ok();
}

// ── Utilisateurs ───────────────────────────────────────────
const memberSchema = z.object({
  role: z.enum(ROLES),
  agency_id: z.string().uuid().nullable(),
});

export async function updateMember(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await adminCtx();
  if (!ctx) return fail(DENIED);
  const id = str(fd, "id");
  if (id === ctx.user.id) return fail("Tu ne peux pas modifier ton propre rôle.");
  const parsed = memberSchema.safeParse({ role: str(fd, "role"), agency_id: opt(fd, "agency_id") });
  if (!parsed.success) return fail("Rôle invalide");

  const { data, error } = await ctx.supabase.from("profiles").update(parsed.data).eq("id", id).select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("Utilisateur introuvable.");
  revalidatePath("/settings/users");
  return ok();
}

const inviteSchema = z.object({
  email: z.string().email("E-mail invalide"),
  role: z.enum(ROLES),
  agency_id: z.string().uuid().nullable(),
});

export async function inviteUser(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await adminCtx();
  if (!ctx) return fail(DENIED);
  const parsed = inviteSchema.safeParse({
    email: str(fd, "email").toLowerCase(), role: str(fd, "role"), agency_id: opt(fd, "agency_id"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  // RPC de la migration 0003 : réservée à l'admin, relance d'une invitation = nouveau jeton + 7 jours.
  const { error } = await ctx.supabase.rpc("create_invitation", {
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_agency_id: parsed.data.agency_id,
  });
  if (error) return fail(dbError(error));
  revalidatePath("/settings/users");
  return ok();
}

export async function deleteInvitation(id: string): Promise<FormState> {
  const ctx = await adminCtx();
  if (!ctx) return fail(DENIED);
  const { error } = await ctx.supabase.from("invitations").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath("/settings/users");
  return ok();
}
