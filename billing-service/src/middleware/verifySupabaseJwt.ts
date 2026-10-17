import type { NextFunction, Request, Response } from "express";
import { supabaseAdmin } from "../config";

export type UserRole = "admin_societe" | "gestionnaire_agence" | "agent" | "comptable";
const ROLES: readonly UserRole[] = ["admin_societe", "gestionnaire_agence", "agent", "comptable"];

export interface AuthContext {
  userId: string;
  companyId: string;
  agencyId: string | null;
  role: UserRole;
}

// Déclaration-merging : on attache le contexte d'authentification à Request.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Vérifie le JWT de l'en-tête Authorization auprès de l'API Auth de Supabase
 * (signature, expiration, révocation), puis charge le profil (société, rôle,
 * agence) avec le client service_role : on reproduit « à la main » ce que la
 * RLS ferait, puisque ce client la contourne.
 */
export async function verifySupabaseJwt(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      res.status(401).json({ error: "En-tête Authorization manquant ou mal formé." });
      return;
    }
    const token = header.slice("Bearer ".length).trim();

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      res.status(401).json({ error: "Jeton d'authentification invalide ou expiré." });
      return;
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id, agency_id, role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (!profile || !profile.company_id) {
      res.status(403).json({ error: "Utilisateur non rattaché à une société." });
      return;
    }
    if (!ROLES.includes(profile.role as UserRole)) {
      res.status(403).json({ error: "Rôle utilisateur inconnu." });
      return;
    }

    req.auth = {
      userId: userData.user.id,
      companyId: profile.company_id as string,
      agencyId: (profile.agency_id as string | null) ?? null,
      role: profile.role as UserRole,
    };
    next();
  } catch (err) {
    console.error("[verifySupabaseJwt]", err);
    res.status(500).json({ error: "Erreur interne d'authentification." });
  }
}

/** Restreint l'accès à une liste de rôles. À placer APRÈS verifySupabaseJwt. */
export function requireRole(...allowed: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: "Non authentifié." });
      return;
    }
    if (!allowed.includes(req.auth.role)) {
      res.status(403).json({ error: `Rôle insuffisant. Rôles autorisés : ${allowed.join(", ")}.` });
      return;
    }
    next();
  };
}
