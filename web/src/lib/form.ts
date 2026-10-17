export type FormState = { ok?: boolean; error?: string; warning?: string; info?: string; nonce?: number; id?: string };

/** Succès. `warning` = succès partiel à signaler ; `info` = précision positive (affichée en toast). */
export const ok = (id?: string, extra: { warning?: string; info?: string } = {}): FormState => ({
  ok: true,
  nonce: Date.now(),
  id,
  ...extra,
});
export const fail = (error: string): FormState => ({ error, nonce: Date.now() });

export const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
};
export const opt = (fd: FormData, key: string) => str(fd, key) || null;
/** Nombre, null si vide, NaN si invalide. */
export const num = (fd: FormData, key: string): number | null => {
  const s = str(fd, key).replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

/** Traduit une erreur Postgres/PostgREST en message lisible. */
export function dbError(e: { code?: string; message?: string }): string {
  switch (e.code) {
    case "23P01":
      return "Conflit : ce véhicule est déjà réservé sur cette période. Choisis d'autres dates ou un autre véhicule.";
    case "23505":
      return "Cet élément existe déjà (doublon).";
    case "23503":
      return "Action impossible : d'autres données dépendent de cet élément.";
    case "42501":
      return "Tu n'as pas les droits nécessaires pour cette action.";
    case "42P01":
    case "PGRST202":
    case "PGRST205":
      return "Table ou fonction introuvable : exécute les migrations SQL 0001 à 0008 dans Supabase.";
    default:
      return e.message || "Erreur inattendue.";
  }
}
