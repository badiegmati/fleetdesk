/**
 * Types de la base.
 *
 * Les types utilisés par l'application sont écrits à la main dans ./db.ts (sous-ensemble
 * des colonnes affichées). Pour générer les types COMPLETS depuis ton projet Supabase :
 *
 *     npm run gen:types          # écrit src/types/database.generated.ts
 *
 * puis importe-les là où tu veux un typage exhaustif (supabase-js accepte `createClient<Database>()`).
 */
export type * from "./db";
