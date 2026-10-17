"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCtx } from "@/lib/ctx";
import { canEdit } from "@/lib/rbac";
import { dbError, fail, ok, num, opt, str, type FormState } from "@/lib/form";
import { billingConfigured, billingFetch, describeInvoice, type InvoiceFromContract } from "@/lib/billing";

const DENIED = "Ton rôle ne permet pas de modifier les contrats.";

function refresh(contractId: string) {
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/contracts");
  revalidatePath("/bookings");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
}

export async function signContract(_p: FormState, fd: FormData): Promise<FormState> {
  const { supabase, role } = await getCtx();
  if (!canEdit(role, "contracts")) return fail(DENIED);
  const id = str(fd, "contract_id");
  const signedBy = str(fd, "signed_by");
  if (!signedBy) return fail("Indique le nom du signataire.");
  if (fd.get("accept") !== "on") return fail("Le client doit accepter les conditions de location.");

  const { error } = await supabase.rpc("sign_contract", { p_contract: id, p_signed_by: signedBy });
  if (error) return fail(dbError(error));
  refresh(id);
  return ok();
}

const inspectionSchema = z.object({
  type: z.enum(["depart", "retour"]),
  mileage_km: z.number("Kilométrage invalide").int().min(0, "Kilométrage invalide").nullable(),
  fuel_level: z.number("Carburant invalide").int().min(0, "Carburant : 0 à 100 %").max(100, "Carburant : 0 à 100 %").nullable(),
  notes: z.string().max(1000).nullable(),
});

export async function saveInspection(_p: FormState, fd: FormData): Promise<FormState> {
  const { supabase, role } = await getCtx();
  if (!canEdit(role, "contracts")) return fail(DENIED);
  const contractId = str(fd, "contract_id");
  const parsed = inspectionSchema.safeParse({
    type: str(fd, "type"),
    mileage_km: num(fd, "mileage_km"),
    fuel_level: num(fd, "fuel_level"),
    notes: opt(fd, "notes"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const { error } = await supabase
    .from("inspections")
    .upsert({ contract_id: contractId, ...parsed.data }, { onConflict: "contract_id,type" });
  if (error) return fail(dbError(error));
  refresh(contractId);
  return ok();
}

/**
 * Clôture : la base termine la réservation et libère le véhicule (RPC close_contract),
 * puis le billing-service crée la facture, son PDF et envoie l'e-mail.
 * Si la facturation échoue, le contrat RESTE clôturé : on avertit, et la facture peut être
 * (re)générée depuis la page Factures (le service est idempotent).
 */
/** Enregistre les chemins de photos déjà téléversées dans Storage (bucket « inspections »). */
export async function addInspectionPhotos(contractId: string, type: "depart" | "retour", paths: string[]): Promise<FormState> {
  const { supabase, role, companyId } = await getCtx();
  if (!canEdit(role, "contracts")) return fail(DENIED);
  if (type !== "depart" && type !== "retour") return fail("Type d'état des lieux invalide.");
  const prefix = `${companyId}/${contractId}/${type}-`;
  // Les chemins viennent du navigateur : on n'accepte que ceux du bon dossier de société/contrat.
  const clean = paths.filter((p) => typeof p === "string" && p.startsWith(prefix) && !p.includes(".."));
  if (!clean.length) return fail("Aucune photo valide.");

  const { data: existing, error: readError } = await supabase
    .from("inspections")
    .select("photo_paths")
    .eq("contract_id", contractId)
    .eq("type", type)
    .maybeSingle();
  if (readError) return fail(dbError(readError));

  const merged = Array.from(new Set([...(existing?.photo_paths ?? []), ...clean])).slice(0, 12);
  const { error } = await supabase
    .from("inspections")
    .upsert({ contract_id: contractId, type, photo_paths: merged }, { onConflict: "contract_id,type" });
  if (error) return fail(dbError(error));
  refresh(contractId);
  return ok();
}

export async function closeContract(_p: FormState, fd: FormData): Promise<FormState> {
  const { supabase, role } = await getCtx();
  if (!canEdit(role, "contracts")) return fail(DENIED);
  const id = str(fd, "contract_id");
  const km = num(fd, "return_km");
  if (km !== null && (Number.isNaN(km) || km < 0)) return fail("Kilométrage de retour invalide.");

  const { error } = await supabase.rpc("close_contract", { p_contract: id, p_return_km: km });
  if (error) return fail(dbError(error));
  refresh(id);

  if (!billingConfigured()) {
    return ok(id, { warning: "Contrat clôturé. Service de facturation non configuré : la facture n'a pas été générée." });
  }
  const bill = await billingFetch<InvoiceFromContract>(supabase, `/invoices/from-contract/${id}`);
  if (!bill.ok) {
    return ok(id, { warning: `Contrat clôturé, mais la facture n'a pas pu être générée (${bill.error}). Relance-la depuis Factures.` });
  }
  return ok(bill.data.invoice.id, { info: describeInvoice(bill.data) });
}
