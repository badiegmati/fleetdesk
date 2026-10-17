import cron from "node-cron";
import { config } from "../config";
import { sendDueReminders } from "../services/invoice.service";

/**
 * Planifie l'exécution quotidienne des relances de factures en retard.
 * Appelle directement la fonction de service (pas de requête HTTP interne) :
 * plus simple, plus robuste, et ne nécessite aucune authentification
 * supplémentaire puisque le code s'exécute dans le même processus de
 * confiance que le reste du service de facturation.
 */
export function scheduleDailyReminders(): void {
  if (!cron.validate(config.reminders.cronSchedule)) {
    console.error(
      `[dailyReminders] Expression cron invalide : "${config.reminders.cronSchedule}". ` +
        "Planification désactivée.",
    );
    return;
  }

  cron.schedule(config.reminders.cronSchedule, async () => {
    console.log("[dailyReminders] Démarrage de l'exécution planifiée des relances…");
    try {
      const result = await sendDueReminders();
      console.log(
        `[dailyReminders] Terminé — envoyées: ${result.sent}, ignorées: ${result.skipped}, échouées: ${result.failed}` +
          (result.mailEnabled ? "" : " (SMTP non configuré : aucun e-mail envoyé)"),
      );
    } catch (err) {
      console.error("[dailyReminders] Échec de l'exécution planifiée :", err);
    }
  });

  console.log(
    `[dailyReminders] Relances planifiées avec l'expression cron "${config.reminders.cronSchedule}".`,
  );
}