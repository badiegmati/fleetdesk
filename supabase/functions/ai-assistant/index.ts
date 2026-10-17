// Edge Function : assistant en langage naturel pour les agents.
// - S'exécute avec le JWT de l'appelant → la RLS Postgres s'applique à chaque outil.
// - Ne confirme JAMAIS une réservation seule : create_booking_draft insère un
//   brouillon (status='pending', is_ai_draft=true) qu'un agent doit valider.
// - Historique persistant dans ai_conversations / ai_messages.
// - Utilise l'API Google Gemini (function calling natif).

import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { createUserClient, isAiEnabled, callGemini, AiProviderError } from "../_shared/supabaseClient.ts";

function decodeJwtSub(authHeader: string): string | null {
  try {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const payloadB64 = token.split(".")[1];
    const normalized = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

const toolDeclarations = [
  {
    name: "search_available_vehicles",
    description:
      "Recherche les véhicules disponibles dans une agence pour une période donnée. " +
      "Utiliser cet outil pour répondre à toute question du type 'quelles voitures sont libres...'.",
    parameters: {
      type: "object",
      properties: {
        agency_id: { type: "string", description: "UUID de l'agence" },
        start_at: { type: "string", description: "Date/heure de début ISO 8601" },
        end_at: { type: "string", description: "Date/heure de fin ISO 8601" },
        category_id: { type: "string", description: "UUID de catégorie (optionnel)" },
      },
      required: ["agency_id", "start_at", "end_at"],
    },
  },
  {
    name: "get_booking",
    description: "Récupère le détail d'une réservation existante par son identifiant.",
    parameters: {
      type: "object",
      properties: { booking_id: { type: "string" } },
      required: ["booking_id"],
    },
  },
  {
    name: "create_booking_draft",
    description:
      "Crée un BROUILLON de réservation (jamais confirmée automatiquement). " +
      "Un agent humain doit ensuite la valider dans l'application.",
    parameters: {
      type: "object",
      properties: {
        agency_id: { type: "string" },
        vehicle_id: { type: "string" },
        customer_id: { type: "string" },
        start_at: { type: "string" },
        end_at: { type: "string" },
        daily_rate: { type: "number" },
        notes: { type: "string" },
      },
      required: ["agency_id", "vehicle_id", "customer_id", "start_at", "end_at", "daily_rate"],
    },
  },
];

const SYSTEM_PROMPT = `Tu es l'assistant interne de FleetDesk, un logiciel de gestion de flotte de location de véhicules.
Tu aides les agents à trouver des véhicules disponibles et à préparer des réservations.
Règles strictes :
- Tu ne confirmes JAMAIS une réservation toi-même. Tu peux seulement créer un BROUILLON via l'outil create_booking_draft, qu'un agent devra valider manuellement.
- Si un outil renvoie une erreur de conflit, explique-la clairement et propose une alternative.
- Réponds en français, de façon concise et professionnelle.
- Précise toujours que tes propositions sont des suggestions à valider par un humain.`;

async function execTool(
  supabase: ReturnType<typeof createUserClient>,
  name: string,
  input: Record<string, unknown>,
) {
  switch (name) {
    case "search_available_vehicles": {
      const { data, error } = await supabase.rpc("search_available_vehicles", {
        p_agency: input.agency_id,
        p_start: input.start_at,
        p_end: input.end_at,
        p_category: input.category_id ?? null,
      });
      if (error) return { error: error.message };
      return { vehicles: data };
    }
    case "get_booking": {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, vehicles(brand, model, plate), customers(full_name)")
        .eq("id", input.booking_id)
        .maybeSingle();
      if (error) return { error: error.message };
      if (!data) return { error: "Réservation introuvable (ou hors de votre société)." };
      return { booking: data };
    }
    case "create_booking_draft": {
      const { data, error } = await supabase.rpc("create_booking_draft", {
        p_agency_id: input.agency_id,
        p_vehicle_id: input.vehicle_id,
        p_customer_id: input.customer_id,
        p_start_at: input.start_at,
        p_end_at: input.end_at,
        p_daily_rate: input.daily_rate,
        p_notes: input.notes ?? null,
      });
      if (error) {
        if (error.code === "23P01") {
          return {
            error:
              "Conflit : ce véhicule est déjà réservé sur une période qui chevauche celle demandée.",
          };
        }
        return { error: error.message };
      }
      return { draft_booking: data };
    }
    default:
      return { error: `Outil inconnu : ${name}` };
  }
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (!isAiEnabled()) {
    return jsonResponse(
      { error: "ai_disabled", message: "Les fonctionnalités IA ne sont pas configurées." },
      503,
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Authorization header manquant." }, 401);
    }

    const userId = decodeJwtSub(authHeader);
    if (!userId) {
      return jsonResponse({ error: "Jeton d'authentification invalide." }, 401);
    }

    const { conversation_id, message } = await req.json();
    if (!message || typeof message !== "string") {
      return jsonResponse({ error: "Le champ 'message' est requis." }, 400);
    }

    const supabase = createUserClient(req);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (profileError || !profile?.company_id) {
      return jsonResponse({ error: "Profil non rattaché à une société." }, 403);
    }

    let convId = conversation_id as string | undefined;
    if (!convId) {
      const { data: conv, error: convError } = await supabase
        .from("ai_conversations")
        .insert({
          company_id: profile.company_id,
          user_id: userId,
          title: message.slice(0, 80),
        })
        .select("id")
        .single();
      if (convError) throw convError;
      convId = conv.id;
    }

    // Les 20 messages les PLUS RÉCENTS (et non les 20 premiers), remis dans l'ordre chronologique.
    const { data: recent } = await supabase
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false })
      .limit(20);
    const history = (recent ?? []).reverse();

    await supabase.from("ai_messages").insert({
      conversation_id: convId,
      role: "user",
      content: message,
    });


    // Historique converti au format Gemini (role "user" / "model")
    const contents: Array<{ role: string; parts: unknown[] }> = [
      ...(history ?? []).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      { role: "user", parts: [{ text: message }] },
    ];

    let finalText = "";
    const toolLog: unknown[] = [];

    for (let turn = 0; turn < 5; turn++) {
      const completion = await callGemini({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        tools: [{ functionDeclarations: toolDeclarations }],
      });
      const candidate = completion.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];

      const functionCalls = parts.filter((p: Record<string, unknown>) => p.functionCall);
      const textParts = parts.filter((p: Record<string, unknown>) => typeof p.text === "string");

      if (textParts.length > 0) {
        finalText = textParts.map((p: { text: string }) => p.text).join("\n");
      }

      contents.push({ role: "model", parts });

      if (functionCalls.length === 0) {
        break;
      }

      const responseParts = [];
      for (const fc of functionCalls) {
        const call = (fc as { functionCall: { name: string; args: Record<string, unknown> } }).functionCall;
        const result = await execTool(supabase, call.name, call.args ?? {});
        toolLog.push({ tool: call.name, input: call.args, result });
        responseParts.push({
          functionResponse: { name: call.name, response: result },
        });
      }
      contents.push({ role: "user", parts: responseParts });
    }

    await supabase.from("ai_messages").insert({
      conversation_id: convId,
      role: "assistant",
      content: finalText || "Je n'ai pas pu produire de réponse.",
      tool_calls: toolLog.length ? toolLog : null,
    });

    return jsonResponse({
      conversation_id: convId,
      message: finalText,
      tool_calls: toolLog,
      ai_label: "Suggestion IA",
    });
  } catch (err) {
    console.error("[ai-assistant]", err);
    // Message du fournisseur IA = déjà nettoyé (voir callGemini) ; le reste reste générique.
    if (err instanceof AiProviderError) return jsonResponse({ error: err.message }, 502);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
