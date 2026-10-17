export const ROLES = [
  "admin_societe",
  "gestionnaire_agence",
  "agent",
  "comptable",
] as const;

export type Role = (typeof ROLES)[number];

export type Section =
  | "dashboard"
  | "fleet"
  | "customers"
  | "bookings"
  | "contracts"
  | "invoices"
  | "maintenance"
  | "assistant"
  | "settings";

export const ROLE_LABELS: Record<Role, string> = {
  admin_societe: "Administrateur",
  gestionnaire_agence: "Gestionnaire d'agence",
  agent: "Agent",
  comptable: "Comptable",
};

const ACCESS: Record<Role, Section[]> = {
  admin_societe: [
    "dashboard",
    "fleet",
    "customers",
    "bookings",
    "contracts",
    "invoices",
    "maintenance",
    "assistant",
    "settings",
  ],
  gestionnaire_agence: [
    "dashboard",
    "fleet",
    "customers",
    "bookings",
    "contracts",
    "invoices",
    "maintenance",
    "assistant",
  ],
  agent: ["dashboard", "fleet", "customers", "bookings", "contracts", "assistant"],
  comptable: ["dashboard", "bookings", "invoices"],
};

/** Convertit une valeur de la base en rôle valide (repli : agent). */
export function toRole(value: unknown): Role {
  return ROLES.includes(value as Role) ? (value as Role) : "agent";
}

/**
 * Masque l'interface selon le rôle. La vraie protection des données
 * reste assurée par la Row Level Security de Postgres.
 */
export const can = (role: Role, section: Section) =>
  ACCESS[role].includes(section);

export type Domain =
  | "fleet" | "customers" | "bookings" | "contracts"
  | "invoices" | "payments" | "billing" | "maintenance" | "settings";

const WRITE: Record<Domain, Role[]> = {
  fleet: ["admin_societe", "gestionnaire_agence"],
  customers: ["admin_societe", "gestionnaire_agence", "agent"],
  bookings: ["admin_societe", "gestionnaire_agence", "agent"],
  contracts: ["admin_societe", "gestionnaire_agence", "agent"],
  // Politiques 0004 : lecture admin/gestionnaire/comptable, écriture admin/comptable.
  invoices: ["admin_societe", "comptable"],
  payments: ["admin_societe", "comptable"],
  // Générer une facture / un PDF via le billing-service (route ouverte aux 3 rôles qui voient les factures).
  billing: ["admin_societe", "gestionnaire_agence", "comptable"],
  maintenance: ["admin_societe", "gestionnaire_agence"],
  settings: ["admin_societe"],
};

/** Droit d'écriture par domaine (miroir des politiques RLS, pour l'affichage). */
export const canEdit = (role: Role, domain: Domain) => WRITE[domain].includes(role);
