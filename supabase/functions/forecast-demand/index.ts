// Edge Function appelée chaque nuit par pg_cron (sans JWT utilisateur).
// Calcule une prévision de demande par agence/catégorie via un lissage
// exponentiel Holt-Winters simple, et écrit le résultat dans demand_forecasts
// avec la clé service_role (contourne la RLS, usage interne uniquement).

import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabaseClient.ts";

const SEASON_LENGTH = 7; // saisonnalité hebdomadaire
const FORECAST_HORIZON_DAYS = 14;
const HISTORY_DAYS = 180;

// Paramètres de lissage fixes et déterministes (pas de boîte noire).
const ALPHA = 0.3; // niveau
const BETA = 0.1;  // tendance
const GAMMA = 0.2; // saisonnalité

interface SeriesPoint {
  date: string;
  count: number;
}

function holtWinters(series: number[], horizon: number) {
  const n = series.length;
  if (n < SEASON_LENGTH * 2) {
    // Pas assez d'historique : fallback simple = moyenne mobile constante
    const avg = series.length ? series.reduce((a, b) => a + b, 0) / series.length : 0;
    const std = Math.sqrt(
      series.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / Math.max(1, series.length),
    );
    return Array.from({ length: horizon }, () => ({
      predicted: Math.max(0, avg),
      lower: Math.max(0, avg - std),
      upper: avg + std,
    }));
  }

  // Initialisation : niveau = moyenne de la première saison,
  // tendance = pente moyenne entre les deux premières saisons,
  // saisonnalité = ratio moyen par jour de la semaine.
  const season1 = series.slice(0, SEASON_LENGTH);
  const season2 = series.slice(SEASON_LENGTH, SEASON_LENGTH * 2);
  const avg1 = season1.reduce((a, b) => a + b, 0) / SEASON_LENGTH;
  const avg2 = season2.reduce((a, b) => a + b, 0) / SEASON_LENGTH;

  let level = avg1;
  let trend = (avg2 - avg1) / SEASON_LENGTH;
  const seasonal = season1.map((v) => (avg1 === 0 ? 1 : v / avg1));

  const residuals: number[] = [];

  for (let t = 0; t < n; t++) {
    const s = seasonal[t % SEASON_LENGTH] || 1;
    const forecast = (level + trend) * s;
    residuals.push(series[t] - forecast);

    const prevLevel = level;
    level = ALPHA * (series[t] / s) + (1 - ALPHA) * (level + trend);
    trend = BETA * (level - prevLevel) + (1 - BETA) * trend;
    seasonal[t % SEASON_LENGTH] =
      GAMMA * (series[t] / level) + (1 - GAMMA) * seasonal[t % SEASON_LENGTH];
  }

  const residualStd = Math.sqrt(
    residuals.reduce((acc, r) => acc + r * r, 0) / Math.max(1, residuals.length),
  );

  const forecasts = [];
  for (let h = 1; h <= horizon; h++) {
    const s = seasonal[(n + h - 1) % SEASON_LENGTH] || 1;
    const predicted = Math.max(0, (level + trend * h) * s);
    forecasts.push({
      predicted,
      lower: Math.max(0, predicted - 1.28 * residualStd), // ~ intervalle 80%
      upper: predicted + 1.28 * residualStd,
    });
  }
  return forecasts;
}

function buildDailySeries(
  bookings: { start_at: string }[],
  days: number,
): SeriesPoint[] {
  const counts = new Map<string, number>();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    counts.set(d.toISOString().slice(0, 10), 0);
  }

  for (const b of bookings) {
    const key = b.start_at.slice(0, 10);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([date, count]) => ({ date, count }));
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  // Vérification du secret partagé avec pg_cron (pas de JWT utilisateur ici).
  // ÉCHEC FERMÉ : cette fonction n'exige pas de JWT (verify_jwt = false) et utilise la clé
  // service_role. Sans CRON_SECRET configuré elle serait ouverte à tout Internet.
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    console.error("[forecast-demand] CRON_SECRET absent : fonction désactivée.");
    return jsonResponse({ error: "Fonction non configurée (CRON_SECRET manquant)." }, 503);
  }
  if (req.headers.get("x-cron-secret") !== cronSecret) {
    return jsonResponse({ error: "Non autorisé" }, 401);
  }

  try {
    const supabase = createServiceClient();

    const { data: companies, error: companiesError } = await supabase
      .from("companies")
      .select("id");
    if (companiesError) throw companiesError;

    const results: Array<{ company_id: string; agency_id: string; category_id: string | null }> = [];

    for (const company of companies ?? []) {
      const { data: agencies } = await supabase
        .from("agencies")
        .select("id")
        .eq("company_id", company.id);

      for (const agency of agencies ?? []) {
        const { data: categories } = await supabase
          .from("vehicle_categories")
          .select("id")
          .eq("company_id", company.id);

        // Boucle sur chaque catégorie, + une passe "toutes catégories" (category_id = null)
        const categoryIds: (string | null)[] = [null, ...(categories ?? []).map((c) => c.id)];

        for (const categoryId of categoryIds) {
          let query = supabase
            .from("bookings")
            .select("start_at, vehicles!inner(category_id)")
            .eq("agency_id", agency.id)
            .neq("status", "cancelled")
            .gte("start_at", new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString());

          if (categoryId) {
            query = query.eq("vehicles.category_id", categoryId);
          }

          const { data: bookings, error: bookingsError } = await query;
          if (bookingsError) {
            console.error("[forecast-demand] erreur lecture bookings", bookingsError);
            continue;
          }
          if (!bookings || bookings.length === 0) continue;

          const series = buildDailySeries(bookings, HISTORY_DAYS);
          const forecast = holtWinters(
            series.map((p) => p.count),
            FORECAST_HORIZON_DAYS,
          );

          const rows = forecast.map((f, idx) => {
            const date = new Date();
            date.setUTCDate(date.getUTCDate() + idx + 1);
            return {
              company_id: company.id,
              agency_id: agency.id,
              category_id: categoryId,
              forecast_date: date.toISOString().slice(0, 10),
              predicted: Number(f.predicted.toFixed(2)),
              lower_bound: Number(f.lower.toFixed(2)),
              upper_bound: Number(f.upper.toFixed(2)),
            };
          });

          const { error: upsertError } = await supabase
            .from("demand_forecasts")
            .upsert(rows, { onConflict: "company_id,agency_id,category_id,forecast_date" });

          if (upsertError) {
            console.error("[forecast-demand] erreur upsert", upsertError);
          } else {
            results.push({ company_id: company.id, agency_id: agency.id, category_id: categoryId });
          }
        }
      }
    }

    return jsonResponse({ ok: true, generated: results.length });
  } catch (err) {
    console.error("[forecast-demand]", err);
    return jsonResponse({ error: (err as Error).message ?? "Erreur interne" }, 500);
  }
});