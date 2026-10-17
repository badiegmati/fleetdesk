// Edge Function : compare les photos d'état des lieux départ/retour
// et suggère une liste de dommages probables avec un niveau de confiance.
// Utilise l'API Google Gemini (multimodal, images en base64 inline).

import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { createUserClient, isAiEnabled, callGemini, AiProviderError } from "../_shared/supabaseClient.ts";

const SIGNED_URL_TTL_SECONDS = 300;

function guessMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

async function urlToBase64(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Impossible de télécharger l'image (${resp.status})`);
  const buf = await resp.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (!isAiEnabled()) {
    return jsonResponse(
      { error: "ai_disabled", message: "Le contrôle d'état des lieux par IA n'est pas configuré." },
      503,
    );
  }

  try {
    const { contract_id } = await req.json();
    if (!contract_id) {
      return jsonResponse({ error: "contract_id est requis" }, 400);
    }

    const supabase = createUserClient(req);

    const { data: inspections, error: inspError } = await supabase
      .from("inspections")
      .select("id, type, photo_paths")
      .eq("contract_id", contract_id)
      .in("type", ["depart", "retour"]);

    if (inspError) throw inspError;

    const depart = inspections?.find((i) => i.type === "depart");
    const retour = inspections?.find((i) => i.type === "retour");

    if (!depart || !retour) {
      return jsonResponse(
        { error: "Les états des lieux de départ ET de retour sont nécessaires." },
        400,
      );
    }
    if (!depart.photo_paths?.length || !retour.photo_paths?.length) {
      return jsonResponse({ error: "Photos manquantes sur l'un des états des lieux." }, 400);
    }

    const signAndEncode = async (paths: string[]) => {
      const parts = [];
      for (const path of paths) {
        const { data, error } = await supabase.storage
          .from("inspections")
          .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
        if (error) throw error;
        const base64 = await urlToBase64(data.signedUrl);
        parts.push({ inlineData: { mimeType: guessMimeType(path), data: base64 } });
      }
      return parts;
    };

    const departParts = await signAndEncode(depart.photo_paths);
    const retourParts = await signAndEncode(retour.photo_paths);

    const completion = await callGemini({
        system_instruction: {
          parts: [{
            text:
              "Tu es un expert en inspection de véhicules de location. Compare les photos de départ et " +
              "de retour et identifie les dommages probables apparus entre les deux (rayures, bosses, " +
              "éclats, pneus, intérieur). Réponds UNIQUEMENT en JSON valide, sous la forme : " +
              '{"findings": [{"zone": string, "description": string, "confidence": number (0-1)}], ' +
              '"overall_confidence": number (0-1), "summary": string}. ' +
              "Si tu ne détectes aucun dommage nouveau, renvoie un tableau findings vide. " +
              "Ceci est une suggestion qui sera validée par un humain, reste factuel et prudent.",
          }],
        },
        contents: [
          {
            role: "user",
            parts: [
              { text: "Photos DÉPART :" },
              ...departParts,
              { text: "Photos RETOUR :" },
              ...retourParts,
              { text: "Compare ces deux séries de photos et renvoie le JSON demandé." },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json" },
      }
    );
    const textOut = completion.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("") ?? "{}";

    let parsed: unknown;
    try {
      parsed = JSON.parse(textOut);
    } catch {
      parsed = { findings: [], overall_confidence: 0, summary: "Réponse IA non interprétable." };
    }

    const aiFindings = {
      ...(parsed as Record<string, unknown>),
      generated_at: new Date().toISOString(),
      label: "Suggestion IA",
    };

    const { error: updateError } = await supabase
      .from("inspections")
      .update({ ai_findings: aiFindings })
      .eq("id", retour.id);

    if (updateError) throw updateError;

    return jsonResponse({ ai_label: "Suggestion IA", ...aiFindings });
  } catch (err) {
    console.error("[damage-check]", err);
    if (err instanceof AiProviderError) return jsonResponse({ error: err.message }, 502);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});