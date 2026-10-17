import { Router } from "express";
import { verifySupabaseJwt, requireRole } from "../middleware/verifySupabaseJwt";
import { createInvoiceFromContract, InvoiceServiceError } from "../services/invoice.service";

export const invoicesRouter = Router();

/**
 * POST /invoices/from-contract/:contractId
 *
 * Déclenche la génération automatique de la facture à la clôture d'un
 * contrat. Autorisé pour admin_societe, gestionnaire_agence et agent
 * (ce sont eux qui closent un contrat), ainsi que comptable (génération/
 * régénération manuelle). Voir les notes de décision dans le README :
 * l'agent n'a PAS accès à la liste des factures ensuite (RLS côté base),
 * mais peut déclencher cette création ponctuelle comme effet de la clôture.
 */
invoicesRouter.post(
  "/from-contract/:contractId",
  verifySupabaseJwt,
  requireRole("admin_societe", "gestionnaire_agence", "agent", "comptable"),
  async (req, res) => {
    const { contractId } = req.params;
    if (!contractId) {
      res.status(400).json({ error: "contractId manquant dans l'URL." });
      return;
    }

    try {
      const { invoice, alreadyExisted, emailSent } = await createInvoiceFromContract(
        contractId,
        req.auth!.companyId,
      );

      res.status(alreadyExisted ? 200 : 201).json({
        invoice,
        already_existed: alreadyExisted,
        email_sent: emailSent,
      });
    } catch (err) {
      if (err instanceof InvoiceServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      console.error("[routes/invoices] Erreur inattendue :", err);
      res.status(500).json({ error: "Erreur interne lors de la génération de la facture." });
    }
  },
);