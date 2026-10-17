"use client";

import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";

/** Rafraîchit la page à chaque changement de réservation ou de véhicule (Supabase Realtime, filtré par la RLS). */
export function useRealtimeBookings() {
  useRealtimeRefresh(["bookings", "vehicles"]);
}
