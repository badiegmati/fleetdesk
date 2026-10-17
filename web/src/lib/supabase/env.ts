/** Variables publiques Supabase, validées avec des erreurs claires. */
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !key) {
    throw new Error(
      "Variables manquantes : définis NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY dans web/.env.local, puis relance « npm run dev ».",
    );
  }
  if (/VOTRE_|votre_|<|>/.test(url + key)) {
    throw new Error(
      "web/.env.local contient encore les valeurs d'exemple (VOTRE_PROJECT_REF…). Remplace-les par l'URL et la clé de ton projet Supabase, enregistre, puis relance « npm run dev ».",
    );
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL invalide (« ${url} »). Format attendu : https://xxxxxxxx.supabase.co`,
    );
  }
  return { url, key };
}
