"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCtx } from "@/lib/ctx";
import { canEdit } from "@/lib/rbac";
import { dbError, fail, ok, num, str, type FormState } from "@/lib/form";
import { billingConfigured, billingFetch, describeInvoice, type InvoiceFromContract, type RemindersResult } from "@/lib/billing";

const paymentSchema = z.object({
  invoice_id: z.string().uuid(),
  amount: z.number("Montant invalide").positive("Le montant doit être positif"),
  method: z.enum(["especes", "carte", "virement", "cheque"]),
});

export async function recordPayment(_p: FormState, fd: FormData): Promise<FormState> {
  const { supabase, role } = await getCtx();
  if (!canEdit(role, "payments")) return fail("Seuls l'administrateur et le comptable enregistrent les paiements.");
  const parsed = paymentSchema.safeParse({
    invoice_id: str(fd, "invoice_id"),
    amount: num(fd, "amount"),
    method: str(fd, "method"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const { error } = await supabase.rpc("record_payment", {
    p_invoice: parsed.data.invoice_id,
    p_amount: parsed.data.amount,
    p_method: parsed.data.method,
  });
  if (error) return fail(dbError(error));
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  return ok();
}

export async function cancelInvoice(id: string): Promise<FormState> {
  const { supabase, role } = await getCtx();
  if (!canEdit(role, "invoices")) return fail("Action non autorisée.");
  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "annulee" })
    .eq("id", id)
    .neq("status", "payee")
    .select("id");
  if (error) return fail(dbError(error));
  if (!data?.length) return fail("Impossible d'annuler une facture déjà payée.");
  revalidatePath("/invoices");
  return ok();
}

/** (Re)génère la facture d'un contrat clôturé via le billing-service (idempotent). */
export async function generateInvoice(contractId: string): Promise<FormState> {
  const { supabase, role } = await getCtx();
  if (!canEdit(role, "billing")) return fail("Action non autorisée.");
  if (!billingConfigured()) return fail("Service de facturation non configuré (BILLING_SERVICE_URL).");
  const r = await billingFetch<InvoiceFromContract>(supabase, `/invoices/from-contract/${contractId}`);
  if (!r.ok) return fail(r.error);
  revalidatePath("/invoices");
  revalidatePath("/contracts");
  return ok(r.data.invoice.id, { info: describeInvoice(r.data) });
}

/** Lien de téléchargement temporaire du PDF (la RLS Storage limite aux rôles autorisés de la société). */
export async function getInvoicePdfUrl(invoiceId: string): Promise<FormState & { url?: string }> {
  const { supabase, role } = await getCtx();
  if (!canEdit(role, "billing")) return fail("Action non autorisée.");
  const { data: inv, error } = await supabase.from("invoices").select("pdf_path").eq("id", invoiceId).maybeSingle();
  if (error) return fail(dbError(error));
  if (!inv?.pdf_path) return fail("Aucun PDF pour cette facture : utilise « Générer le PDF ».");
  const { data, error: sErr } = await supabase.storage.from("invoices").createSignedUrl(inv.pdf_path as string, 300);
  if (sErr || !data) return fail("Impossible de créer le lien de téléchargement.");
  return { ...ok(), url: data.signedUrl };
}

/** Relance manuelle des factures en retard de LA société de l'utilisateur. */
export async function runReminders(): Promise<FormState> {
  const { supabase, role } = await getCtx();
  if (!canEdit(role, "payments")) return fail("Réservé à l'administrateur et au comptable.");
  if (!billingConfigured()) return fail("Service de facturation non configuré (BILLING_SERVICE_URL).");
  const r = await billingFetch<RemindersResult>(supabase, "/reminders/run");
  if (!r.ok) return fail(r.error);
  revalidatePath("/invoices");
  if (!r.data.mailEnabled) return ok(undefined, { warning: "SMTP non configuré côté service : aucune relance envoyée." });
  return ok(undefined, { info: `Relances : ${r.data.sent} envoyée(s), ${r.data.skipped} ignorée(s) (pas d'e-mail), ${r.data.failed} en échec.` });
}
