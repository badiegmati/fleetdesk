"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Banknote, BellRing, FileDown, Receipt } from "lucide-react";
import { AnimatedCounter } from "@/components/motion/AnimatedCounter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { FormAlert } from "@/components/ui/form-alert";
import { Field, SelectField } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { InvoiceBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { useFormAction } from "@/components/ui/useFormAction";
import { PAYMENT_METHOD, fmtDate, money } from "@/lib/format";
import { fadeUp, stagger } from "@/lib/motion";
import type { InvoiceStatus, PaymentMethod } from "@/types/db";
import { cancelInvoice, generateInvoice, getInvoicePdfUrl, recordPayment, runReminders } from "./actions";

export type InvoiceRow = {
  id: string; contract_id: string; invoice_no: string; contract_no: string; customer: string;
  amount_ht: number; amount_ttc: number; paid: number; pdf: boolean; status: InvoiceStatus; due_date: string;
};
export type UnbilledContract = { id: string; contract_no: string; closed_at: string; customer: string; total: number };

type Filter = "all" | "emise" | "en_retard" | "payee";

type Props = {
  rows: InvoiceRow[]; unbilled: UnbilledContract[]; currency: string;
  canPay: boolean; canCancel: boolean; canBill: boolean; billingEnabled: boolean;
};

export function InvoicesClient({ rows, unbilled, currency, canPay, canCancel, canBill, billingEnabled }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [paying, setPaying] = useState<InvoiceRow | null>(null);
  const toast = useToast();
  const [pending, start] = useTransition();

  const live = rows.filter((r) => r.status !== "annulee");
  const outstanding = live.filter((r) => r.status !== "payee").reduce((s, r) => s + (r.amount_ttc - r.paid), 0);
  const overdue = live.filter((r) => r.status === "en_retard").reduce((s, r) => s + (r.amount_ttc - r.paid), 0);
  const collected = live.reduce((s, r) => s + r.paid, 0);
  const count = (f: Exclude<Filter, "all">) => rows.filter((r) => r.status === f).length;
  const shown = rows.filter((r) => filter === "all" || r.status === filter);

  const run = (fn: () => Promise<{ ok?: boolean; error?: string; info?: string; warning?: string; url?: string }>, success?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast(r.error ?? "Erreur", "error");
      if (r.url) window.open(r.url, "_blank", "noopener");
      if (success) toast(success);
      if (r.info) toast(r.info);
      if (r.warning) toast(r.warning, "error");
    });

  const billingNotice = !billingEnabled && (canBill || canPay) && (
    <Card className="border-warning/30 p-4 text-sm text-muted">
      Service de facturation non configuré : définis <code className="text-brand-cyan">BILLING_SERVICE_URL</code> dans <code>web/.env.local</code> pour générer les PDF, envoyer les factures par e-mail et relancer les retards.
    </Card>
  );

  const unbilledCard = canBill && unbilled.length > 0 && (
    <Card className="border-warning/30 p-5">
      <h2 className="font-semibold text-warning">Contrats clôturés sans facture ({unbilled.length})</h2>
      <p className="mt-1 text-xs text-muted">La génération est idempotente : relancer une facture déjà créée ne crée aucun doublon.</p>
      <ul className="mt-3 divide-y divide-border">
        {unbilled.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
            <span><span className="font-mono text-brand-cyan">{c.contract_no}</span> · {c.customer} · {money(c.total, currency)} HT</span>
            <Button className="px-3 py-1.5 text-xs" loading={pending} disabled={!billingEnabled} onClick={() => run(() => generateInvoice(c.id))}>
              Générer la facture
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );

  if (rows.length === 0) {
    return (
      <div className="space-y-6">
        {billingNotice}
        {unbilledCard}
        <EmptyState
          icon={Receipt}
          title="Aucune facture pour l'instant"
          text="Une facture est créée automatiquement à la clôture d'un contrat (par le service de facturation)."
        />
      </div>
    );
  }

  return (
    <>
      {billingNotice}
      {unbilledCard}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Encaissé" value={collected} tone="text-success" currency={currency} />
        <Stat label="À encaisser" value={outstanding} tone="text-brand-cyan" currency={currency} />
        <Stat label="En retard" value={overdue} tone="text-danger" currency={currency} />
      </div>

      <FilterTabs
        layoutId="invoice-filter"
        label="Filtrer les factures"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "Toutes", count: rows.length },
          { value: "emise", label: "Émises", count: count("emise") },
          { value: "en_retard", label: "En retard", count: count("en_retard") },
          { value: "payee", label: "Payées", count: count("payee") },
        ]}
      />

      <Card className="overflow-hidden">
        <motion.ul key={filter} variants={stagger(0, 0.03)} initial="hidden" animate="visible" className="divide-y divide-border">
          {shown.length === 0 && <li className="px-5 py-10 text-center text-sm text-muted">Aucune facture dans cette catégorie.</li>}
          {shown.map((r) => (
            <motion.li key={r.id} variants={fadeUp} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
              <span className="w-20 font-mono text-sm text-brand-cyan">{r.invoice_no}</span>
              <div className="min-w-40 flex-1">
                <p className="font-medium">{r.customer}</p>
                <p className="text-xs text-muted">Contrat {r.contract_no} · échéance {fmtDate(r.due_date)}</p>
              </div>
              <div className="text-right text-sm">
                <p className="font-medium">{money(r.amount_ttc, currency)}</p>
                <p className="text-xs text-muted">HT {money(r.amount_ht, currency)}{r.paid > 0 ? ` · payé ${money(r.paid, currency)}` : ""}</p>
              </div>
              <InvoiceBadge status={r.status} />
              <div className="flex gap-2">
                {canBill && r.status !== "annulee" && (
                  <Button
                    variant="ghost"
                    className="px-3 py-1.5 text-xs"
                    loading={pending}
                    onClick={() => run(() => (r.pdf ? getInvoicePdfUrl(r.id) : generateInvoice(r.contract_id)))}
                  >
                    <FileDown size={14} aria-hidden="true" /> {r.pdf ? "PDF" : "Générer le PDF"}
                  </Button>
                )}
                {canPay && (r.status === "emise" || r.status === "en_retard") && (
                  <Button className="px-3 py-1.5 text-xs" onClick={() => setPaying(r)}>
                    <Banknote size={14} aria-hidden="true" /> Paiement
                  </Button>
                )}
                {canCancel && r.status !== "payee" && r.status !== "annulee" && (
                  <Button
                    variant="ghost"
                    className="px-3 py-1.5 text-xs text-red-300"
                    loading={pending}
                    onClick={() =>
                      window.confirm(`Annuler la facture ${r.invoice_no} ?`) &&
                      start(async () => {
                        const res = await cancelInvoice(r.id);
                        toast(res.ok ? "Facture annulée" : (res.error ?? "Erreur"), res.ok ? "success" : "error");
                      })
                    }
                  >
                    Annuler
                  </Button>
                )}
              </div>
            </motion.li>
          ))}
        </motion.ul>
      </Card>
      {canPay && billingEnabled && (
        <div className="flex justify-end">
          <Button variant="ghost" loading={pending} className="text-xs" onClick={() => run(runReminders)}>
            <BellRing size={14} aria-hidden="true" /> Relancer les factures en retard
          </Button>
        </div>
      )}

      <Modal open={paying !== null} onClose={() => setPaying(null)} title="Enregistrer un paiement" description={paying ? `${paying.invoice_no} — ${paying.customer}` : undefined}>
        {paying && <PaymentForm invoice={paying} currency={currency} onDone={() => setPaying(null)} />}
      </Modal>
    </>
  );
}

function Stat({ label, value, tone, currency }: { label: string; value: number; tone: string; currency: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${tone}`}>
        <AnimatedCounter value={value} decimals={2} suffix={` ${currency}`} />
      </p>
    </Card>
  );
}

function PaymentForm({ invoice, currency, onDone }: { invoice: InvoiceRow; currency: string; onDone: () => void }) {
  const remaining = Math.max(0, Math.round((invoice.amount_ttc - invoice.paid) * 100) / 100);
  const { state, formAction, pending } = useFormAction(recordPayment, { successMessage: "Paiement enregistré", onSuccess: onDone });
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="invoice_id" value={invoice.id} />
      <p className="text-sm text-muted">Reste à payer : <span className="font-semibold text-text">{money(remaining, currency)}</span></p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="amount" label={`Montant (${currency})`} type="number" step="0.01" min={0.01} max={remaining} defaultValue={remaining} required />
        <SelectField id="method" label="Mode de paiement" defaultValue="carte">
          {(Object.keys(PAYMENT_METHOD) as PaymentMethod[]).map((m) => (
            <option key={m} value={m}>{PAYMENT_METHOD[m]}</option>
          ))}
        </SelectField>
      </div>
      <FormAlert error={state.error} nonce={state.nonce} />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>Annuler</Button>
        <Button type="submit" loading={pending}>Enregistrer</Button>
      </div>
    </form>
  );
}
