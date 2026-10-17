import "dotenv/config";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Chargement et validation des variables d'environnement.
 * Le service refuse de démarrer si une variable OBLIGATOIRE est absente
 * (Supabase). Le SMTP est FACULTATIF : sans lui, les factures sont créées
 * et leur PDF stocké, mais aucun e-mail n'est envoyé (voir mail.service.ts).
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    const envFile = resolve(process.cwd(), ".env");
    const hint =
      !existsSync(envFile) || statSync(envFile).size === 0
        ? `Le fichier ${envFile} est absent ou VIDE : copie .env.example en .env (« copy .env.example .env » sous PowerShell), ` +
          "renseigne SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY, puis relance. (Lance toujours la commande depuis le dossier billing-service.)"
        : "Vérifie le contenu du fichier .env (local) ou les variables du service (Render/Railway).";
    throw new Error(`[config] Variable d'environnement manquante : ${name}. ${hint}`);
  }
  return value.trim();
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function optionalEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const smtpHost = optionalEnv("SMTP_HOST");
const smtpUser = optionalEnv("SMTP_USER");
const smtpPassword = optionalEnv("SMTP_PASSWORD");

export const config = {
  port: optionalEnvNumber("PORT", 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",

  supabaseUrl: requireEnv("SUPABASE_URL"),
  supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),

  smtp: {
    enabled: Boolean(smtpHost && smtpUser && smtpPassword),
    host: smtpHost ?? "",
    port: optionalEnvNumber("SMTP_PORT", 587),
    secure: process.env.SMTP_SECURE === "true",
    user: smtpUser ?? "",
    password: smtpPassword ?? "",
    fromName: process.env.SMTP_FROM_NAME ?? "FleetDesk",
    fromEmail: optionalEnv("SMTP_FROM_EMAIL") ?? smtpUser ?? "",
  },

  invoice: {
    dueDays: optionalEnvNumber("INVOICE_DUE_DAYS", 15),
    vatRate: optionalEnvNumber("INVOICE_VAT_RATE", 19),
  },

  reminders: {
    minIntervalDays: optionalEnvNumber("REMINDER_MIN_INTERVAL_DAYS", 3),
    cronSchedule: process.env.REMINDER_CRON_SCHEDULE ?? "0 8 * * *",
  },

  /** Fuseau métier (la Tunisie n'a pas d'heure d'été). */
  timeZone: process.env.BUSINESS_TIMEZONE ?? "Africa/Tunis",
} as const;

/**
 * Client Supabase « admin » : clé SERVICE_ROLE, qui CONTOURNE la Row Level
 * Security. Il ne doit JAMAIS être utilisé pour une requête entrante sans
 * vérification préalable des droits (voir middleware/verifySupabaseJwt.ts) :
 * c'est le service lui-même qui reproduit les règles que la RLS appliquerait.
 */
function assertServiceRoleKey(key: string): void {
  // Les clés historiques sont des JWT dont le claim « role » vaut « service_role » ;
  // une clé « anon » collée par erreur ferait échouer silencieusement les écritures.
  if (key.startsWith("eyJ")) {
    try {
      const payload = JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString("utf8")) as {
        role?: string;
      };
      if (payload.role && payload.role !== "service_role") {
        throw new Error(
          `[config] SUPABASE_SERVICE_ROLE_KEY a le rôle « ${payload.role} » au lieu de « service_role ». ` +
            "Copie la clé « service_role » (Project Settings → API), pas la clé « anon ».",
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("[config]")) throw err;
    }
  }
}
assertServiceRoleKey(config.supabaseServiceRoleKey);

export const supabaseAdmin: SupabaseClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
