import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.password },
    });
  }
  return transporter;
}

/** Échappe le HTML : les noms de société / numéros viennent de la base. */
function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric", timeZone: config.timeZone });

export interface SendInvoiceEmailParams {
  to: string;
  invoiceNo: string;
  amountTtc: number;
  currency: string;
  dueDate: Date;
  pdfBuffer: Buffer;
  companyName: string;
}

/** Renvoie false (sans erreur) si le SMTP n'est pas configuré. */
export async function sendInvoiceEmail(params: SendInvoiceEmailParams): Promise<boolean> {
  if (!config.smtp.enabled) return false;
  const company = esc(params.companyName);

  await getTransporter().sendMail({
    from: `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`,
    to: params.to,
    subject: `Votre facture ${params.invoiceNo} — ${params.companyName}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
        <p>Bonjour,</p>
        <p>
          Veuillez trouver ci-joint votre facture <strong>${esc(params.invoiceNo)}</strong>
          d'un montant de <strong>${params.amountTtc.toFixed(2)} ${esc(params.currency)}</strong>,
          à régler avant le <strong>${fmtDate(params.dueDate)}</strong>.
        </p>
        <p>Merci de votre confiance.</p>
        <p style="color:#6b7280; font-size: 12px;">— ${company}</p>
      </div>
    `,
    attachments: [{ filename: `${params.invoiceNo}.pdf`, content: params.pdfBuffer, contentType: "application/pdf" }],
  });
  return true;
}

export interface SendReminderEmailParams {
  to: string;
  invoiceNo: string;
  amountTtc: number;
  currency: string;
  dueDate: Date;
  daysLate: number;
  companyName: string;
}

export async function sendReminderEmail(params: SendReminderEmailParams): Promise<boolean> {
  if (!config.smtp.enabled) return false;
  const company = esc(params.companyName);

  await getTransporter().sendMail({
    from: `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`,
    to: params.to,
    subject: `Rappel — Facture ${params.invoiceNo} en retard de paiement`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
        <p>Bonjour,</p>
        <p>
          Nous vous rappelons que la facture <strong>${esc(params.invoiceNo)}</strong>
          d'un montant de <strong>${params.amountTtc.toFixed(2)} ${esc(params.currency)}</strong>,
          dont l'échéance était fixée au <strong>${fmtDate(params.dueDate)}</strong>
          (soit ${params.daysLate} jour${params.daysLate > 1 ? "s" : ""} de retard),
          reste impayée à ce jour.
        </p>
        <p>Merci de bien vouloir procéder au règlement dans les meilleurs délais.</p>
        <p style="color:#6b7280; font-size: 12px;">— ${company}</p>
      </div>
    `,
  });
  return true;
}
