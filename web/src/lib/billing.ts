import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Client du billing-service (Node/Express sur Render ou Railway).
 * Appelé UNIQUEMENT depuis le serveur Next.js : BILLING_SERVICE_URL n'a pas de préfixe
 * NEXT_PUBLIC_ et n'est donc jamais envoyée au navigateur. Le JWT de l'utilisateur est
 * transmis : c'est le service qui vérifie la société et le rôle.
 */
export const billingConfigured = () => Boolean(process.env.BILLING_SERVICE_URL?.trim());

export type BillingResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

export async function billingFetch<T>(
  supabase: SupabaseClient,
  path: string,
  init: { method?: "GET" | "POST" } = {},
): Promise<BillingResult<T>> {
  const base = process.env.BILLING_SERVICE_URL?.trim().replace(/\/$/, "");
  if (!base) return { ok: false, error: "Service de facturation non configuré (BILLING_SERVICE_URL)." };

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { ok: false, error: "Session expirée, reconnecte-toi.", status: 401 };

  try {
    const res = await fetch(`${base}${path}`, {
      method: init.method ?? "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      // Le service peut dormir (offre gratuite Render) : on laisse le temps de se réveiller.
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) return { ok: false, error: json.error ?? `Erreur du service de facturation (${res.status}).`, status: res.status };
    return { ok: true, data: json };
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      ok: false,
      error: timeout
        ? "Le service de facturation ne répond pas (il démarre peut-être) : réessaie dans une minute."
        : "Service de facturation injoignable.",
    };
  }
}

export type InvoiceFromContract = {
  invoice: { id: string; invoice_no: string };
  already_existed: boolean;
  email_sent: boolean;
};
export type RemindersResult = { sent: number; skipped: number; failed: number; mailEnabled: boolean };

/** Message de succès lisible après génération de la facture. */
export function describeInvoice(r: InvoiceFromContract): string {
  const mail = r.email_sent ? " et envoyée au client" : "";
  return r.already_existed ? `Facture ${r.invoice.invoice_no} déjà existante` : `Facture ${r.invoice.invoice_no} générée${mail}`;
}
