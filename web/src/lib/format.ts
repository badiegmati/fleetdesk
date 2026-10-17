import type { BookingStatus, InvoiceStatus, MaintenanceType, PaymentMethod, VehicleStatus } from "@/types/db";

/** Fuseau d'affichage unique : identique côté serveur et navigateur (pas d'écart d'hydratation). */
export const TZ = "Africa/Tunis";

export const money = (n: number | null | undefined, currency = "TND") =>
  `${(n ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export const fmtDate = (v: string | Date | null | undefined) =>
  v
    ? new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ })
    : "—";

export const fmtDateTime = (v: string | Date | null | undefined) =>
  v
    ? new Date(v).toLocaleString("fr-FR", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ,
      })
    : "—";

/** Clé de jour « YYYY-MM-DD » dans le fuseau d'affichage. */
export const dayKey = (v: string | Date) =>
  new Date(v).toLocaleDateString("en-CA", { timeZone: TZ });

export const num = (n: number | null | undefined) => (n ?? 0).toLocaleString("fr-FR");

type Tone = "violet" | "blue" | "cyan" | "success" | "danger" | "warning" | "muted";
type Meta = { label: string; tone: Tone };

export const VEHICLE_STATUS: Record<VehicleStatus, Meta> = {
  disponible: { label: "Disponible", tone: "success" },
  loue: { label: "Loué", tone: "cyan" },
  maintenance: { label: "Maintenance", tone: "warning" },
  hors_service: { label: "Hors service", tone: "danger" },
};

export const BOOKING_STATUS: Record<BookingStatus, Meta> = {
  pending: { label: "En attente", tone: "violet" },
  confirmed: { label: "Confirmée", tone: "blue" },
  active: { label: "En cours", tone: "cyan" },
  completed: { label: "Terminée", tone: "muted" },
  cancelled: { label: "Annulée", tone: "danger" },
};

export const INVOICE_STATUS: Record<InvoiceStatus, Meta> = {
  brouillon: { label: "Brouillon", tone: "muted" },
  emise: { label: "Émise", tone: "blue" },
  payee: { label: "Payée", tone: "success" },
  en_retard: { label: "En retard", tone: "danger" },
  annulee: { label: "Annulée", tone: "muted" },
};

export const MAINTENANCE_TYPE: Record<MaintenanceType, string> = {
  preventive: "Préventive",
  corrective: "Corrective",
  controle_technique: "Contrôle technique",
};

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  especes: "Espèces",
  carte: "Carte",
  virement: "Virement",
  cheque: "Chèque",
};

/** Normalise un embed PostgREST (objet ou tableau d'un élément). */
export function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}
