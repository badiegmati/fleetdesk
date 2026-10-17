import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config";
import { healthRouter } from "./routes/health";
import { invoicesRouter } from "./routes/invoices";
import { remindersRouter } from "./routes/reminders";
import { scheduleDailyReminders } from "./jobs/dailyReminders";

const app = express();

// Render / Railway placent le service derrière un proxy.
app.set("trust proxy", 1);

// ------------------------------------------------------------
// Middlewares globaux
// ------------------------------------------------------------
app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",").map((o) => o.trim()),
    methods: ["GET", "POST"],
    allowedHeaders: ["Authorization", "Content-Type"],
  }),
);
app.use(express.json({ limit: "2mb" }));

// ------------------------------------------------------------
// Routes
// ------------------------------------------------------------
app.use(healthRouter);
app.use("/invoices", invoicesRouter);
app.use("/reminders", remindersRouter);

// 404
app.use((req, res) => {
  res.status(404).json({ error: `Route inconnue : ${req.method} ${req.path}` });
});

// Gestionnaire d'erreurs global (filet de sécurité final)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[server] Erreur non gérée :", err);
  res.status(500).json({ error: "Erreur interne du serveur." });
});

// ------------------------------------------------------------
// Démarrage
// ------------------------------------------------------------
const server = app.listen(config.port, () => {
  console.log(`[server] FleetDesk billing-service démarré sur le port ${config.port} (${config.nodeEnv})`);
  if (!config.smtp.enabled) {
    console.warn("[server] SMTP non configuré : les factures seront créées SANS envoi d'e-mail.");
  }
  if (config.nodeEnv === "production" && config.corsOrigin === "*") {
    console.warn("[server] CORS_ORIGIN=* en production : renseigne l'URL de ton site Vercel.");
  }
  scheduleDailyReminders();
});

// Arrêt propre (Render/Railway envoient SIGTERM à chaque déploiement).
process.on("SIGTERM", () => {
  console.log("[server] SIGTERM reçu : arrêt en cours…");
  server.close(() => process.exit(0));
});