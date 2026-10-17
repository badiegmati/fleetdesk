import { randomUUID } from "node:crypto";
import { config, supabaseAdmin } from "../config";
import { generateInvoicePdf } from "./pdf.service";
import { uploadInvoicePdf } from "./storage.service";
import { sendInvoiceEmail, sendReminderEmail } from "./mail.service";

// Sous-ensemble des colonnes réellement utilisées (pas de types générés ici).
interface ContractRow {
  id: string;
  company_id: string;
  booking_id: string;
  contract_no: string;
  deposit: number;
  closed_at: string | null;
}

interface BookingRow {
  id: string;
  agency_id: string;
  vehicle_id: string;
  customer_id: string;
  start_at: string;
  end_at: string;
  daily_rate: number;
  total_amount: number;
}

export interface InvoiceRow {
  id: string;
  company_id: string;
  contract_id: string;
  invoice_no: string;
  amount_ht: number;
  vat_rate: number;
  amount_ttc: number;
  status: string;
  due_date: string;
  pdf_path: string | null;
  last_reminder_at: string | null;
}

export class InvoiceServiceError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
    this.name = "InvoiceServiceError";
  }
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
}

/** Date du jour « YYYY-MM-DD » dans le fuseau métier. */
function todayKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: config.timeZone });
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertValidUuid(value: string, fieldName: string): void {
  if (!UUID_REGEX.test(value)) {
    throw new InvoiceServiceError(`${fieldName} n'est pas un UUID valide.`, 400);
  }
}

/** Contexte nécessaire au PDF et à l'e-mail (lu une seule fois). */
interface BillingContext {
  contract: ContractRow;
  booking: BookingRow;
  vehicle: { brand: string; model: string; plate: string };
  customer: { full_name: string; email: string | null };
  agency: { name: string };
  company: { name: string; currency: string };
}

async function loadContext(contract: ContractRow): Promise<BillingContext> {
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from("bookings")
    .select("id, agency_id, vehicle_id, customer_id, start_at, end_at, daily_rate, total_amount")
    .eq("id", contract.booking_id)
    .maybeSingle<BookingRow>();
  if (bookingError || !booking) {
    throw new InvoiceServiceError("Réservation associée introuvable.", 404);
  }

  const [{ data: vehicle }, { data: customer }, { data: agency }, { data: company }] = await Promise.all([
    supabaseAdmin.from("vehicles").select("brand, model, plate").eq("id", booking.vehicle_id).maybeSingle(),
    supabaseAdmin.from("customers").select("full_name, email").eq("id", booking.customer_id).maybeSingle(),
    supabaseAdmin.from("agencies").select("name").eq("id", booking.agency_id).maybeSingle(),
    supabaseAdmin.from("companies").select("name, currency").eq("id", contract.company_id).maybeSingle(),
  ]);
  if (!vehicle || !customer || !agency || !company) {
    throw new InvoiceServiceError("Données associées au contrat incomplètes.", 500);
  }
  return { contract, booking, vehicle, customer, agency, company };
}

/** Génère le PDF d'une facture et le range dans Storage ; renvoie le chemin. */
async function buildAndStorePdf(
  invoice: InvoiceRow,
  ctx: BillingContext,
  issueDate: Date,
): Promise<{ pdfPath: string; pdfBuffer: Buffer }> {
  const pdfBuffer = await generateInvoicePdf({
    invoiceNo: invoice.invoice_no,
    issueDate,
    dueDate: new Date(`${invoice.due_date}T12:00:00Z`),
    companyName: ctx.company.name,
    companyCurrency: ctx.company.currency,
    agencyName: ctx.agency.name,
    customerName: ctx.customer.full_name,
    customerEmail: ctx.customer.email,
    vehicleLabel: `${ctx.vehicle.brand} ${ctx.vehicle.model} — ${ctx.vehicle.plate}`,
    rentalStart: new Date(ctx.booking.start_at),
    rentalEnd: new Date(ctx.booking.end_at),
    dailyRate: Number(ctx.booking.daily_rate),
    days: daysBetween(new Date(ctx.booking.start_at), new Date(ctx.booking.end_at)),
    amountHt: Number(invoice.amount_ht),
    vatRate: Number(invoice.vat_rate),
    amountTtc: Number(invoice.amount_ttc),
    deposit: Number(ctx.contract.deposit ?? 0),
  });
  const pdfPath = await uploadInvoicePdf(invoice.company_id, invoice.id, pdfBuffer);
  return { pdfPath, pdfBuffer };
}

/**
 * Crée (ou renvoie si elle existe déjà) la facture d'un contrat clôturé :
 * montants → insertion → PDF → Storage → mise à jour → e-mail.
 *
 * Sécurité : callerCompanyId doit être celui du contrat (ce contrôle remplace
 * la RLS, contournée par la clé service_role).
 *
 * Robustesse :
 *  - idempotent, y compris sous appels simultanés (index unique de la migration 0008) ;
 *  - si une facture existe mais que son PDF manque (échec antérieur), le PDF est régénéré ;
 *  - une facture ANNULÉE n'empêche pas d'en émettre une nouvelle.
 */
export async function createInvoiceFromContract(
  contractId: string,
  callerCompanyId: string,
): Promise<{ invoice: InvoiceRow; alreadyExisted: boolean; emailSent: boolean }> {
  assertValidUuid(contractId, "contractId");

  const { data: contract, error: contractError } = await supabaseAdmin
    .from("contracts")
    .select("id, company_id, booking_id, contract_no, deposit, closed_at")
    .eq("id", contractId)
    .maybeSingle<ContractRow>();
  if (contractError) {
    throw new InvoiceServiceError(`Erreur lecture contrat : ${contractError.message}`, 500);
  }
  // Message volontairement identique : on ne confirme jamais l'existence d'une ressource d'une autre société.
  if (!contract || contract.company_id !== callerCompanyId) {
    throw new InvoiceServiceError("Contrat introuvable.", 404);
  }
  if (!contract.closed_at) {
    throw new InvoiceServiceError("Le contrat n'est pas encore clôturé — facturation impossible.", 409);
  }

  const findExisting = async (): Promise<InvoiceRow | null> => {
    const { data, error } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("contract_id", contractId)
      .neq("status", "annulee")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<InvoiceRow>();
    if (error) {
      throw new InvoiceServiceError(`Erreur vérification facture existante : ${error.message}`, 500);
    }
    return data;
  };

  // Facture déjà présente : on répare le PDF manquant le cas échéant, sans rien dupliquer.
  const repairIfNeeded = async (existing: InvoiceRow) => {
    if (existing.pdf_path) return { invoice: existing, alreadyExisted: true, emailSent: false };
    const ctx = await loadContext(contract);
    const { pdfPath } = await buildAndStorePdf(existing, ctx, new Date(existing.due_date));
    const { data: fixed, error } = await supabaseAdmin
      .from("invoices")
      .update({ pdf_path: pdfPath })
      .eq("id", existing.id)
      .select("*")
      .single<InvoiceRow>();
    if (error || !fixed) {
      throw new InvoiceServiceError(`Échec de la réparation du PDF : ${error?.message}`, 500);
    }
    return { invoice: fixed, alreadyExisted: true, emailSent: false };
  };

  const existing = await findExisting();
  if (existing) return repairIfNeeded(existing);

  const ctx = await loadContext(contract);

  const amountHt = Number(ctx.booking.total_amount);
  const vatRate = config.invoice.vatRate;
  const amountTtc = Math.round(amountHt * (1 + vatRate / 100) * 100) / 100;

  const issueDate = new Date();
  const dueDate = new Date(issueDate);
  dueDate.setDate(dueDate.getDate() + config.invoice.dueDays);

  // company_id explicite : le trigger de numérotation (0003) ne peut pas le déduire
  // de auth.uid(), qui est NULL avec la clé service_role.
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("invoices")
    .insert({
      id: randomUUID(),
      company_id: contract.company_id,
      contract_id: contract.id,
      amount_ht: amountHt,
      vat_rate: vatRate,
      amount_ttc: amountTtc,
      status: "emise",
      due_date: dueDate.toISOString().slice(0, 10),
    })
    .select("*")
    .single<InvoiceRow>();

  if (insertError?.code === "23505") {
    // Un appel concurrent a gagné la course : on renvoie sa facture.
    const winner = await findExisting();
    if (winner) return repairIfNeeded(winner);
  }
  if (insertError || !inserted) {
    throw new InvoiceServiceError(`Échec de la création de la facture : ${insertError?.message ?? "inconnue"}`, 500);
  }

  const { pdfPath, pdfBuffer } = await buildAndStorePdf(inserted, ctx, issueDate);

  const { data: finalInvoice, error: updateError } = await supabaseAdmin
    .from("invoices")
    .update({ pdf_path: pdfPath })
    .eq("id", inserted.id)
    .select("*")
    .single<InvoiceRow>();
  if (updateError || !finalInvoice) {
    // La facture existe sans PDF : un nouvel appel la répare (voir repairIfNeeded).
    throw new InvoiceServiceError(`Facture créée mais chemin PDF non enregistré : ${updateError?.message}`, 500);
  }

  // L'e-mail ne doit jamais faire échouer la facturation : la facture reste consultable dans l'application.
  let emailSent = false;
  if (ctx.customer.email) {
    try {
      emailSent = await sendInvoiceEmail({
        to: ctx.customer.email,
        invoiceNo: finalInvoice.invoice_no,
        amountTtc: Number(finalInvoice.amount_ttc),
        currency: ctx.company.currency,
        dueDate,
        pdfBuffer,
        companyName: ctx.company.name,
      });
    } catch (mailErr) {
      console.error("[invoice.service] Échec envoi e-mail facture :", mailErr);
    }
  }

  return { invoice: finalInvoice, alreadyExisted: false, emailSent };
}

// ------------------------------------------------------------
// Relances
// ------------------------------------------------------------

/**
 * Passe « émise » → « en retard » les factures échues.
 * @param companyId limite à une société (appel manuel) ; omis = toutes (cron).
 */
export async function markOverdueInvoices(companyId?: string): Promise<number> {
  let query = supabaseAdmin
    .from("invoices")
    .update({ status: "en_retard" })
    .eq("status", "emise")
    .lt("due_date", todayKey());
  if (companyId) query = query.eq("company_id", companyId);

  const { data, error } = await query.select("id");
  if (error) {
    throw new InvoiceServiceError(`Échec de la mise à jour des factures en retard : ${error.message}`, 500);
  }
  return data?.length ?? 0;
}

interface OverdueInvoiceWithContext extends InvoiceRow {
  contracts: {
    bookings: { customers: { full_name: string; email: string | null } | null } | null;
  } | null;
  companies: { name: string; currency: string } | null;
}

export interface ReminderResult {
  sent: number;
  skipped: number;
  failed: number;
  mailEnabled: boolean;
}

/**
 * Relance par e-mail les factures en retard n'ayant pas reçu de relance depuis
 * `minIntervalDays`. @param companyId limite à une société (appel manuel) ;
 * omis = toutes les sociétés (cron).
 */
export async function sendDueReminders(companyId?: string): Promise<ReminderResult> {
  await markOverdueInvoices(companyId);

  if (!config.smtp.enabled) {
    return { sent: 0, skipped: 0, failed: 0, mailEnabled: false };
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - config.reminders.minIntervalDays);

  let query = supabaseAdmin
    .from("invoices")
    .select(
      `id, company_id, contract_id, invoice_no, amount_ht, vat_rate, amount_ttc,
       status, due_date, pdf_path, last_reminder_at,
       contracts:contract_id ( bookings:booking_id ( customers:customer_id ( full_name, email ) ) ),
       companies:company_id ( name, currency )`,
    )
    .eq("status", "en_retard")
    .or(`last_reminder_at.is.null,last_reminder_at.lt.${cutoff.toISOString()}`);
  if (companyId) query = query.eq("company_id", companyId);

  const { data: invoices, error } = await query;
  if (error) {
    throw new InvoiceServiceError(`Échec de la récupération des factures en retard : ${error.message}`, 500);
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const raw of (invoices ?? []) as unknown as OverdueInvoiceWithContext[]) {
    const email = raw.contracts?.bookings?.customers?.email;
    if (!email) {
      skipped += 1;
      continue;
    }
    const dueDate = new Date(`${raw.due_date}T12:00:00Z`);
    try {
      await sendReminderEmail({
        to: email,
        invoiceNo: raw.invoice_no,
        amountTtc: Number(raw.amount_ttc),
        currency: raw.companies?.currency ?? "TND",
        dueDate,
        daysLate: daysBetween(dueDate, new Date()),
        companyName: raw.companies?.name ?? "FleetDesk",
      });
      await supabaseAdmin.from("invoices").update({ last_reminder_at: new Date().toISOString() }).eq("id", raw.id);
      sent += 1;
    } catch (mailErr) {
      console.error(`[invoice.service] Échec relance facture ${raw.invoice_no} :`, mailErr);
      failed += 1;
    }
  }

  return { sent, skipped, failed, mailEnabled: true };
}
