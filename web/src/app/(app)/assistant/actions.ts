"use server";

import { getCtx } from "@/lib/ctx";
import { dbError, opt, str } from "@/lib/form";

export type AvailableVehicle = {
  id: string; label: string; plate: string; category: string | null; baseRate: number; suggestedRate: number;
};
export type SearchState = {
  nonce?: number; error?: string; from?: string; to?: string;
  results?: AvailableVehicle[]; occupancy?: number; advice?: string;
};

const iso = (d: string, h: string) => `${d}T${h}:00+01:00`; // Tunisie : UTC+1, sans heure d'été

/** Règles déterministes (pas de boîte noire) : majoration si forte demande, remise si faible. */
function priceAdjustment(occ: number) {
  if (occ >= 0.85) return { pct: 20, why: "Demande très forte" };
  if (occ >= 0.7) return { pct: 10, why: "Demande soutenue" };
  if (occ <= 0.3) return { pct: -10, why: "Faible demande" };
  return { pct: 0, why: "Demande normale" };
}

export async function findAvailable(_p: SearchState, fd: FormData): Promise<SearchState> {
  const { supabase } = await getCtx();
  const nonce = Date.now();
  const from = str(fd, "from");
  const to = str(fd, "to");
  const agency = opt(fd, "agency_id");
  const category = opt(fd, "category_id");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return { nonce, error: "Choisis une date de départ et de retour." };
  if (to <= from) return { nonce, error: "Le retour doit être après le départ." };
  const start = iso(from, "09:00");
  const end = iso(to, "09:00");

  const { data, error } = await supabase.rpc("search_available_vehicles", {
    p_agency: agency, p_start: start, p_end: end, p_category: category,
  });
  if (error) return { nonce, error: dbError(error) };

  const [cats, fleet, busy] = await Promise.all([
    supabase.from("vehicle_categories").select("id, name, daily_rate"),
    (agency ? supabase.from("vehicles").select("id").eq("agency_id", agency) : supabase.from("vehicles").select("id")).neq("status", "hors_service"),
    (agency ? supabase.from("bookings").select("vehicle_id").eq("agency_id", agency) : supabase.from("bookings").select("vehicle_id"))
      .in("status", ["pending", "confirmed", "active"])
      .lt("start_at", end)
      .gt("end_at", start),
  ]);

  const fleetSize = fleet.data?.length ?? 0;
  const busyCount = new Set((busy.data ?? []).map((b) => b.vehicle_id as string)).size;
  const occupancy = fleetSize ? busyCount / fleetSize : 0;
  const adj = priceAdjustment(occupancy);
  const catMap = new Map((cats.data ?? []).map((c) => [c.id as string, c as { id: string; name: string; daily_rate: number }]));

  const results: AvailableVehicle[] = ((data ?? []) as { id: string; brand: string; model: string; plate: string; category_id: string | null }[]).map((v) => {
    const cat = v.category_id ? catMap.get(v.category_id) : undefined;
    const base = Number(cat?.daily_rate ?? 0);
    return {
      id: v.id,
      label: `${v.brand} ${v.model}`,
      plate: v.plate,
      category: cat?.name ?? null,
      baseRate: base,
      suggestedRate: Math.round(base * (1 + adj.pct / 100)),
    };
  });

  const pctTxt = Math.round(occupancy * 100);
  const advice =
    adj.pct === 0
      ? `${adj.why} (${pctTxt} % d'occupation prévue) : garde le tarif de base.`
      : `${adj.why} (${pctTxt} % d'occupation prévue) : tarif ${adj.pct > 0 ? "majoré" : "réduit"} de ${Math.abs(adj.pct)} %.`;

  return { nonce, from, to, results, occupancy: pctTxt, advice };
}
