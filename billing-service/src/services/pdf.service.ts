import PDFDocument from "pdfkit";
import { PassThrough } from "node:stream";
import { config } from "../config";

export interface InvoicePdfData {
  invoiceNo: string;
  issueDate: Date;
  dueDate: Date;
  companyName: string;
  companyCurrency: string;
  agencyName: string;
  customerName: string;
  customerEmail: string | null;
  vehicleLabel: string; // ex: "Peugeot 308 - 124 TUN 2024"
  rentalStart: Date;
  rentalEnd: Date;
  dailyRate: number;
  days: number;
  amountHt: number;
  vatRate: number;
  amountTtc: number;
  deposit: number;
}

function formatMoney(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    year: "numeric", month: "long", day: "numeric", timeZone: config.timeZone,
  });
}

/**
 * Génère un PDF de facture professionnel avec PDFKit et le renvoie sous
 * forme de Buffer (plus simple à manipuler ensuite : upload Storage,
 * pièce jointe e-mail) plutôt que d'écrire directement sur disque — ce qui
 * évite toute dépendance à un système de fichiers persistant sur
 * Render/Railway (dont le disque est éphémère entre déploiements).
 */
export function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const stream = new PassThrough();
    const chunks: Buffer[] = [];

    stream.on("data", (chunk) => chunks.push(chunk as Buffer));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
    doc.pipe(stream);

    // ------------------------------------------------------------
    // En-tête
    // ------------------------------------------------------------
    doc
      .fontSize(22)
      .fillColor("#111827")
      .text(data.companyName, { continued: false })
      .fontSize(10)
      .fillColor("#6b7280")
      .text(data.agencyName)
      .moveDown(1.5);

    doc
      .fontSize(18)
      .fillColor("#111827")
      .text(`Facture ${data.invoiceNo}`, { align: "right" })
      .fontSize(10)
      .fillColor("#6b7280")
      .text(`Émise le ${formatDate(data.issueDate)}`, { align: "right" })
      .text(`Échéance le ${formatDate(data.dueDate)}`, { align: "right" })
      .moveDown(1.5);

    doc.strokeColor("#e5e7eb").moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // ------------------------------------------------------------
    // Client
    // ------------------------------------------------------------
    doc.fontSize(12).fillColor("#111827").text("Facturé à :", { underline: false });
    doc.fontSize(11).fillColor("#374151").text(data.customerName);
    if (data.customerEmail) {
      doc.fontSize(10).fillColor("#6b7280").text(data.customerEmail);
    }
    doc.moveDown(1.5);

    // ------------------------------------------------------------
    // Détail de la location
    // ------------------------------------------------------------
    doc.fontSize(12).fillColor("#111827").text("Détail de la location");
    doc.moveDown(0.5);

    const tableTop = doc.y;
    const col1 = 50;
    const col2 = 262;
    const col3 = 392;
    const col4 = 470;

    doc
      .fontSize(10)
      .fillColor("#6b7280")
      .text("Véhicule", col1, tableTop)
      .text("Période", col2, tableTop)
      .text("Jours", col3, tableTop)
      .text("Tarif/jour", col4, tableTop);

    doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).strokeColor("#e5e7eb").stroke();

    const rowY = tableTop + 25;
    doc
      .fontSize(10)
      .fillColor("#111827")
      .text(data.vehicleLabel, col1, rowY, { width: 200 })
      .text(`${formatDate(data.rentalStart)} au ${formatDate(data.rentalEnd)}`, col2, rowY, {
        width: 124,
      })
      .text(String(data.days), col3, rowY)
      .text(formatMoney(data.dailyRate, data.companyCurrency), col4, rowY);

    doc.moveDown(3);

    // ------------------------------------------------------------
    // Totaux
    // ------------------------------------------------------------
    const totalsX = 350;
    let y = doc.y + 10;

    doc.fontSize(10).fillColor("#6b7280").text("Montant HT", totalsX, y);
    doc.fillColor("#111827").text(formatMoney(data.amountHt, data.companyCurrency), 470, y);
    y += 18;

    doc.fillColor("#6b7280").text(`TVA (${data.vatRate.toFixed(0)}%)`, totalsX, y);
    doc
      .fillColor("#111827")
      .text(formatMoney(data.amountTtc - data.amountHt, data.companyCurrency), 470, y);
    y += 18;

    doc.moveTo(totalsX, y).lineTo(545, y).strokeColor("#e5e7eb").stroke();
    y += 8;

    doc
      .fontSize(13)
      .fillColor("#111827")
      .text("Total TTC", totalsX, y, { continued: false });
    doc.text(formatMoney(data.amountTtc, data.companyCurrency), 470, y);

    if (data.deposit > 0) {
      y += 30;
      doc
        .fontSize(9)
        .fillColor("#6b7280")
        .text(
          `Pour rappel : une caution de ${formatMoney(data.deposit, data.companyCurrency)} ` +
            "a été prise lors de la signature du contrat (remboursable, non incluse ci-dessus).",
          50,
          y,
          { width: 495 },
        );
    }

    // ------------------------------------------------------------
    // Pied de page
    // ------------------------------------------------------------
    doc
      .fontSize(8)
      .fillColor("#9ca3af")
      .text(
        `${data.companyName} — Document généré automatiquement par FleetDesk.`,
        50,
        780,
        { width: 495, align: "center" },
      );

    doc.end();
  });
}