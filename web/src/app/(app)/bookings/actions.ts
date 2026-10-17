"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCtx } from "@/lib/ctx";
import { canEdit } from "@/lib/rbac";
import { dbError, fail, ok, opt, str, type FormState } from "@/lib/form";

const schema = z
  .object({
    vehicle_id: z.string().uuid("Choisis un véhicule"),
    customer_id: z.string().uuid("Choisis un client"),
    start_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Date de départ invalide"),
    end_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Date de retour invalide"),
    status: z.enum(["pending", "confirmed"]),
    notes: z.string().max(500).nullable(),
  })
  .refine((v) => Date.parse(v.end_at) > Date.parse(v.start_at), {
    message: "Le retour doit être après le départ",
    path: ["end_at"],
  });

/**
 * Création d'une réservation. Le chevauchement est refusé PAR LA BASE
 * (contrainte d'exclusion no_double_booking → erreur 23P01), même avec des requêtes simultanées.
 */
export async function saveBooking(_p: FormState, fd: FormData): Promise<FormState> {
  const { supabase, role } = await getCtx();
  if (!canEdit(role, "bookings")) return fail("Ton rôle ne permet pas de créer des réservations.");

  const parsed = schema.safeParse({
    vehicle_id: str(fd, "vehicle_id"),
    customer_id: str(fd, "customer_id"),
    start_at: str(fd, "start_at"),
    end_at: str(fd, "end_at"),
    status: str(fd, "status") || "confirmed",
    notes: opt(fd, "notes"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const { error } = await supabase.from("bookings").insert(parsed.data);
  if (error) return fail(dbError(error));

  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  return ok();
}

export async function setBookingStatus(id: string, status: "confirmed" | "cancelled"): Promise<FormState> {
  const { supabase, role } = await getCtx();
  if (!canEdit(role, "bookings")) return fail("Action non autorisée.");

  const { data: current } = await supabase.from("bookings").select("status").eq("id", id).maybeSingle();
  if (!current) return fail("Réservation introuvable.");
  const allowed = status === "confirmed" ? ["pending"] : ["pending", "confirmed"];
  if (!allowed.includes(current.status as string)) {
    return fail("Cette réservation ne peut plus changer de statut (utilise le contrat).");
  }

  const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  return ok();
}

export async function createContract(bookingId: string, deposit: number): Promise<FormState> {
  const { supabase, role } = await getCtx();
  if (!canEdit(role, "contracts")) return fail("Action non autorisée.");
  const { data, error } = await supabase.rpc("create_contract_from_booking", {
    p_booking: bookingId,
    p_deposit: Number.isFinite(deposit) ? deposit : 0,
  });
  if (error) return fail(dbError(error));
  revalidatePath("/bookings");
  revalidatePath("/contracts");
  return ok(data as string);
}
