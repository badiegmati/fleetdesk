"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

export type ActionState = { error?: string; info?: string; email?: string };

const credentials = z.object({
  email: z.string().email("E-mail invalide"),
  password: z.string().min(8, "Le mot de passe doit contenir 8 caractères minimum"),
});

/** URL publique du site (pour les liens envoyés par e-mail). */
async function getOrigin() {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000"
  );
}

/** Erreur réseau (Supabase injoignable : mauvaise URL, pas d'internet, projet en pause). */
function isNetworkError(error: { message?: string; status?: number; name?: string } | null) {
  if (!error) return false;
  return (
    error.name === "AuthRetryableFetchError" ||
    error.status === 0 ||
    /fetch failed|network|ENOTFOUND|ECONNREFUSED|timeout/i.test(error.message ?? "")
  );
}

function networkMessage() {
  let host = "?";
  try {
    host = new URL(getSupabaseEnv().url).host;
  } catch (e) {
    // Configuration invalide : le message de l'erreur est le plus utile.
    return e instanceof Error ? e.message : "Configuration Supabase invalide.";
  }
  return `Impossible de joindre ${host}. Vérifie ta connexion internet (VPN, antivirus, pare-feu) et que le projet Supabase n'est pas en pause.`;
}

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function login(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = readString(formData, "email");
  const parsed = credentials.safeParse({
    email,
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (isNetworkError(error)) return { error: networkMessage(), email };
  if (error) return { error: "E-mail ou mot de passe incorrect", email };

  redirect("/dashboard");
}

export async function register(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = readString(formData, "email");
  const parsed = credentials.safeParse({
    email,
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  const origin = await getOrigin();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/onboarding` },
  });
  if (isNetworkError(error)) return { error: networkMessage(), email };
  if (error) return { error: error.message, email };

  // Confirmation par e-mail activée dans Supabase : pas de session immédiate.
  if (!data.session) {
    return { info: "Vérifie ta boîte mail pour confirmer ton compte.", email };
  }
  redirect("/onboarding");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const onboardingSchema = z.object({
  company: z.string().min(2, "Le nom de la société est trop court"),
  fullName: z.string().min(2, "Le nom complet est trop court"),
});

export async function createCompany(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = onboardingSchema.safeParse({
    company: readString(formData, "company"),
    fullName: readString(formData, "fullName"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_company_and_admin", {
    p_company: parsed.data.company,
    p_full_name: parsed.data.fullName,
  });
  if (error) return { error: "Impossible de créer la société. Réessaie." };

  redirect("/dashboard");
}

const emailSchema = z.object({ email: z.string().email("E-mail invalide") });

export async function requestPasswordReset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = readString(formData, "email");
  const parsed = emailSchema.safeParse({ email });
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  const origin = await getOrigin();
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  // Réponse volontairement identique, que le compte existe ou non.
  return {
    info: "Si un compte existe pour cet e-mail, un lien de réinitialisation vient d'être envoyé.",
    email,
  };
}

const newPasswordSchema = z
  .object({
    password: z.string().min(8, "Le mot de passe doit contenir 8 caractères minimum"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Les deux mots de passe ne correspondent pas",
    path: ["confirm"],
  });

export async function updatePassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) return { error: "Impossible de modifier le mot de passe. Le lien a peut-être expiré." };

  redirect("/dashboard");
}
