import { Router } from "express";
import { verifySupabaseJwt, requireRole } from "../middleware/verifySupabaseJwt";
import { sendDueReminders } from "../services/invoice.service";

export const remindersRouter = Router();

/**
 * POST /reminders/run
 *
 * Déclenchement MANUEL des relances (bouton « Relancer maintenant »).
 * Réservé à admin_societe et comptable. Il ne traite QUE les factures de la
 * société de l'appelant — le client service_role contourne la RLS, donc le
 * filtre est appliqué ici explicitement. Le cron quotidien (jobs/dailyReminders.ts)
 * traite, lui, toutes les sociétés.
 */
remindersRouter.post("/run", verifySupabaseJwt, requireRole("admin_societe", "comptable"), async (req, res) => {
  try {
    const result = await sendDueReminders(req.auth!.companyId);
    res.status(200).json(result);
  } catch (err) {
    console.error("[routes/reminders] Erreur inattendue :", err);
    res.status(500).json({ error: "Erreur interne lors de l'exécution des relances." });
  }
});
