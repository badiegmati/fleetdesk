import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

/**
 * Client "utilisateur" : forward le JWT de l'appelant.
 * La RLS Postgres s'applique donc exactement comme pour une requête
 * normale faite depuis le navigateur. À utiliser pour ai-assistant
 * et damage-check, qui ne doivent JAMAIS voir plus de données que
 * l'utilisateur qui appelle.
 */
export function createUserClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw new Error("Authorization header manquant");
  }
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/**
 * Client "service" : clé service_role, contourne la RLS.
 * Réservé aux tâches planifiées sans utilisateur (forecast-demand),
 * jamais exposé à un appelant externe.
 */
export function createServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Les fonctions IA sont optionnelles : si la clé modèle est absente, on les désactive. */
export function isAiEnabled(): boolean {
  return Boolean(Deno.env.get("GEMINI_API_KEY"));
}

/**
 * Les modèles Gemini sont retirés régulièrement (1.5 et 2.0 sont arrêtés, 2.5 s'arrête
 * le 16 oct. 2026). On ne se repose donc pas sur une valeur codée en dur : le secret
 * GEMINI_MODEL fait foi, et la valeur ci-dessous n'est qu'un défaut raisonnable.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

export function getAiConfig() {
  return {
    apiKey: Deno.env.get("GEMINI_API_KEY")!,
    model: Deno.env.get("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL,
  };
}

/** Erreur du fournisseur IA, avec un message sûr à renvoyer au navigateur. */
export class AiProviderError extends Error {}

/**
 * Appelle generateContent. La clé passe par l'en-tête x-goog-api-key (jamais dans l'URL,
 * qui finit dans les journaux). Le détail brut de l'erreur reste dans les logs de la
 * fonction ; l'appelant ne reçoit qu'un message générique.
 */
// deno-lint-ignore no-explicit-any
export async function callGemini(body: unknown): Promise<any> {
  const { apiKey, model } = getAiConfig();
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    },
  );
  if (!resp.ok) {
    console.error(`[gemini] HTTP ${resp.status} (modèle ${model}) :`, (await resp.text()).slice(0, 500));
    if (resp.status === 404) {
      throw new AiProviderError(`Le modèle IA « ${model} » n'est plus disponible. Mets à jour le secret GEMINI_MODEL.`);
    }
    if (resp.status === 400 || resp.status === 403) {
      throw new AiProviderError("Requête IA refusée : vérifie la clé GEMINI_API_KEY et le modèle GEMINI_MODEL.");
    }
    if (resp.status === 429) throw new AiProviderError("Quota IA atteint, réessaie dans un moment.");
    throw new AiProviderError("Le service IA est momentanément indisponible.");
  }
  return await resp.json();
}