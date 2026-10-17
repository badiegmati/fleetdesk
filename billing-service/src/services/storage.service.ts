import { supabaseAdmin } from "../config";

const INVOICE_BUCKET = "invoices";

/**
 * Chemin de stockage conforme à la convention imposée par les policies
 * Storage définies en SQL : {company_id}/... (voir migration 0006).
 */
function buildInvoicePath(companyId: string, invoiceId: string): string {
  return `${companyId}/${invoiceId}.pdf`;
}

/**
 * Upload le PDF généré dans le bucket privé "invoices", avec la clé
 * service_role (contourne la RLS Storage côté écriture — normal ici,
 * c'est le backend de confiance qui écrit, pas un utilisateur final).
 */
export async function uploadInvoicePdf(
  companyId: string,
  invoiceId: string,
  pdfBuffer: Buffer,
): Promise<string> {
  const path = buildInvoicePath(companyId, invoiceId);

  const { error } = await supabaseAdmin.storage.from(INVOICE_BUCKET).upload(path, pdfBuffer, {
    contentType: "application/pdf",
    upsert: true,
  });

  if (error) {
    throw new Error(`Échec de l'upload du PDF de facture : ${error.message}`);
  }

  return path;
}

/**
 * Génère une URL signée temporaire, utile si le frontend souhaite proposer
 * un lien de téléchargement direct au lieu de re-télécharger via son propre
 * backend. Expire rapidement par défaut (sécurité : bucket privé).
 */
export async function getSignedInvoiceUrl(
  path: string,
  expiresInSeconds = 300,
): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(INVOICE_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data) {
    throw new Error(`Échec de la génération de l'URL signée : ${error?.message ?? "inconnue"}`);
  }

  return data.signedUrl;
}