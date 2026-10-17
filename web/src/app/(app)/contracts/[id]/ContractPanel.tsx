"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Camera, Check, Fuel, Gauge, PenLine, Receipt, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormAlert } from "@/components/ui/form-alert";
import { Field, TextareaField } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useFormAction } from "@/components/ui/useFormAction";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, fmtDateTime, money, num } from "@/lib/format";
import { cn } from "@/lib/utils";
import { addInspectionPhotos, closeContract, saveInspection, signContract } from "../actions";

export type ContractData = {
  id: string; contract_no: string; signed_at: string | null; signed_by: string | null; closed_at: string | null;
  deposit: number; start_at: string; end_at: string; daily_rate: number; total: number;
  vehicle: { plate: string; brand: string; model: string; mileage_km: number } | null;
  customer: { full_name: string; email: string | null; phone: string | null; license_no: string | null } | null;
};
export type Finding = { zone?: string; description?: string; confidence?: number };
export type AiFindings = { findings?: Finding[]; overall_confidence?: number; summary?: string } | null;
export type InspectionData = {
  type: "depart" | "retour"; mileage_km: number | null; fuel_level: number | null; notes: string | null; created_at: string;
  photos: { path: string; url: string }[]; ai_findings: AiFindings;
};
type Invoice = { id: string; invoice_no: string; status: string; amount_ttc: number } | null;

export function ContractPanel({
  contract: c, inspections, invoice, canEdit, currency, companyId,
}: { contract: ContractData; inspections: InspectionData[]; invoice: Invoice; canEdit: boolean; currency: string; companyId: string }) {
  const signed = !!c.signed_at;
  const closed = !!c.closed_at;
  const steps = [
    { label: "Créé", done: true },
    { label: "Signé", done: signed },
    { label: "Clôturé", done: closed },
  ];
  const depart = inspections.find((i) => i.type === "depart");
  const retour = inspections.find((i) => i.type === "retour");

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-sm text-brand-cyan">{c.contract_no}</p>
            <h1 className="mt-1 text-2xl font-bold">{c.customer?.full_name ?? "Client"}</h1>
            <p className="mt-1 text-sm text-muted">
              {c.vehicle ? `${c.vehicle.brand} ${c.vehicle.model} · ${c.vehicle.plate}` : "—"}
            </p>
          </div>
          <ol className="flex items-center gap-2" aria-label="Progression du contrat">
            {steps.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                    s.done ? "border-success/30 bg-success/15 text-success" : "border-border text-muted",
                  )}
                >
                  {s.done && <Check size={12} aria-hidden="true" />}{s.label}
                </span>
                {i < steps.length - 1 && <span className="h-px w-4 bg-border" aria-hidden="true" />}
              </li>
            ))}
          </ol>
        </div>
        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-4">
          <Info label="Départ" value={fmtDateTime(c.start_at)} />
          <Info label="Retour prévu" value={fmtDateTime(c.end_at)} />
          <Info label="Tarif / jour" value={money(c.daily_rate, currency)} />
          <Info label="Total HT" value={money(c.total, currency)} />
          <Info label="Caution" value={money(c.deposit, currency)} />
          <Info label="Permis" value={c.customer?.license_no ?? "—"} />
          <Info label="Téléphone" value={c.customer?.phone ?? "—"} />
          <Info label="E-mail" value={c.customer?.email ?? "—"} />
        </dl>
      </Card>

      <Card className="p-6">
        <h2 className="flex items-center gap-2 font-semibold"><PenLine size={17} aria-hidden="true" /> Signature</h2>
        {signed ? (
          <p className="mt-3 text-sm text-muted">
            Signé par <span className="text-text">{c.signed_by}</span> le {fmtDateTime(c.signed_at)}.
          </p>
        ) : canEdit ? (
          <SignForm contractId={c.id} defaultName={c.customer?.full_name ?? ""} />
        ) : (
          <p className="mt-3 text-sm text-muted">En attente de signature.</p>
        )}
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <InspectionCard type="depart" contractId={c.id} companyId={companyId} existing={depart} canEdit={canEdit && !closed} defaultKm={c.vehicle?.mileage_km} />
        <InspectionCard type="retour" contractId={c.id} companyId={companyId} existing={retour} canEdit={canEdit && !closed && signed} defaultKm={retour?.mileage_km ?? undefined} />
      </div>

      {depart?.photos.length && retour?.photos.length ? (
        <DamageCheck contractId={c.id} canEdit={canEdit} stored={retour.ai_findings} />
      ) : null}

      <Card className="p-6">
        <h2 className="flex items-center gap-2 font-semibold"><Receipt size={17} aria-hidden="true" /> Clôture et facturation</h2>
        {closed ? (
          <div className="mt-3 space-y-2 text-sm">
            <p className="text-muted">Contrat clôturé le {fmtDate(c.closed_at)}. Le véhicule a été libéré.</p>
            {invoice ? (
              <p className="flex flex-wrap items-center gap-3">
                Facture <span className="font-mono text-brand-cyan">{invoice.invoice_no}</span> — {money(invoice.amount_ttc, currency)} TTC
                <Badge tone={invoice.status === "payee" ? "success" : invoice.status === "en_retard" ? "danger" : "blue"}>{invoice.status === "payee" ? "Payée" : invoice.status === "en_retard" ? "En retard" : "Émise"}</Badge>
                <Link href="/invoices" className="text-brand-cyan hover:underline">Voir les factures</Link>
              </p>
            ) : (
              <p className="text-muted">Une facture a été générée (visible par l&apos;administrateur, le gestionnaire et le comptable).</p>
            )}
          </div>
        ) : !signed ? (
          <p className="mt-3 text-sm text-muted">Le contrat doit être signé avant de pouvoir être clôturé.</p>
        ) : canEdit ? (
          <CloseForm contractId={c.id} defaultKm={retour?.mileage_km ?? undefined} />
        ) : (
          <p className="mt-3 text-sm text-muted">Clôture réservée aux rôles autorisés.</p>
        )}
      </Card>
    </motion.div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function SignForm({ contractId, defaultName }: { contractId: string; defaultName: string }) {
  const { state, formAction, pending } = useFormAction(signContract, { successMessage: "Contrat signé — véhicule marqué « Loué »" });
  return (
    <form action={formAction} className="mt-4 space-y-4">
      <input type="hidden" name="contract_id" value={contractId} />
      <Field id="signed_by" label="Nom du signataire" defaultValue={defaultName} required />
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="accept" className="mt-0.5 size-4 accent-brand-blue" required />
        Le client a lu et accepte les conditions générales de location (signature électronique horodatée).
      </label>
      <FormAlert error={state.error} nonce={state.nonce} />
      <Button type="submit" loading={pending}>Signer le contrat</Button>
    </form>
  );
}

function InspectionCard({
  type, contractId, companyId, existing, canEdit, defaultKm,
}: { type: "depart" | "retour"; contractId: string; companyId: string; existing?: InspectionData; canEdit: boolean; defaultKm?: number }) {
  const [editing, setEditing] = useState(false);
  const { state, formAction, pending } = useFormAction(saveInspection, {
    successMessage: "État des lieux enregistré",
    onSuccess: () => setEditing(false),
  });
  const title = type === "depart" ? "État des lieux — départ" : "État des lieux — retour";

  return (
    <Card className="p-6">
      <h2 className="font-semibold">{title}</h2>
      {(existing?.photos.length ?? 0) > 0 && (
        <ul className="mt-3 grid grid-cols-4 gap-2" aria-label="Photos">
          {existing!.photos.map((p) => (
            <li key={p.path}>
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Photo ${title}`} loading="lazy" className="aspect-square w-full object-cover" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {canEdit && <PhotoUploader contractId={contractId} companyId={companyId} type={type} count={existing?.photos.length ?? 0} />}
      {existing && !editing ? (
        <div className="mt-3 space-y-2 text-sm">
          <p className="flex items-center gap-2"><Gauge size={15} className="text-brand-cyan" aria-hidden="true" />{existing.mileage_km != null ? `${num(existing.mileage_km)} km` : "—"}</p>
          <p className="flex items-center gap-2"><Fuel size={15} className="text-brand-cyan" aria-hidden="true" />{existing.fuel_level != null ? `${existing.fuel_level} %` : "—"}</p>
          {existing.notes && <p className="text-muted">{existing.notes}</p>}
          {canEdit && (
            <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue">
              Modifier
            </button>
          )}
        </div>
      ) : canEdit ? (
        <form action={formAction} className="mt-4 space-y-4">
          <input type="hidden" name="contract_id" value={contractId} />
          <input type="hidden" name="type" value={type} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="mileage_km" label="Kilométrage" type="number" min={0} defaultValue={existing?.mileage_km ?? defaultKm ?? ""} />
            <Field id="fuel_level" label="Carburant (%)" type="number" min={0} max={100} defaultValue={existing?.fuel_level ?? ""} />
          </div>
          <TextareaField id="notes" label="Observations (rayures, dommages…)" defaultValue={existing?.notes ?? ""} />
          <FormAlert error={state.error} nonce={state.nonce} />
          <Button type="submit" loading={pending}>Enregistrer</Button>
        </form>
      ) : (
        <p className="mt-3 text-sm text-muted">
          {type === "retour" ? "Disponible une fois le contrat signé." : "Aucun état des lieux enregistré."}
        </p>
      )}
    </Card>
  );
}

function CloseForm({ contractId, defaultKm }: { contractId: string; defaultKm?: number }) {
  const { state, formAction, pending } = useFormAction(closeContract, {
    successMessage: "Contrat clôturé — facture générée",
  });
  return (
    <form action={formAction} className="mt-4 space-y-4">
      <input type="hidden" name="contract_id" value={contractId} />
      <p className="text-sm text-muted">
        La clôture termine la réservation, libère le véhicule et génère automatiquement la facture (TVA 19 %, échéance à 30 jours).
      </p>
      <div className="max-w-xs">
        <Field id="return_km" label="Kilométrage au retour" type="number" min={0} defaultValue={defaultKm ?? ""} hint="Met à jour le compteur du véhicule." />
      </div>
      <FormAlert error={state.error} nonce={state.nonce} />
      <Button type="submit" loading={pending}>Clôturer et facturer</Button>
    </form>
  );
}

const MAX_PHOTOS = 12;
const MAX_BYTES = 5 * 1024 * 1024;

/** Téléverse directement dans Storage (le JWT de l'utilisateur + la RLS Storage s'appliquent). */
function PhotoUploader({ contractId, companyId, type, count }: { contractId: string; companyId: string; type: "depart" | "retour"; count: number }) {
  const toast = useToast();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  const upload = (files: File[]) =>
    start(async () => {
      const room = MAX_PHOTOS - count;
      const valid = files.filter((f) => f.type.startsWith("image/") && f.size <= MAX_BYTES).slice(0, Math.max(room, 0));
      if (valid.length < files.length) toast(`Certaines photos ignorées (image ≤ 5 Mo, ${MAX_PHOTOS} max par état des lieux).`, "error");
      if (!valid.length) return;

      const supabase = createClient();
      const paths: string[] = [];
      for (const [i, file] of valid.entries()) {
        const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
        const path = `${companyId}/${contractId}/${type}-${Date.now()}-${i}.${ext}`;
        const { error } = await supabase.storage.from("inspections").upload(path, file, { contentType: file.type });
        if (error) {
          toast(`Échec de l'envoi de « ${file.name} » : ${error.message}`, "error");
          continue;
        }
        paths.push(path);
      }
      if (paths.length) {
        const r = await addInspectionPhotos(contractId, type, paths);
        if (r.ok) {
          toast(`${paths.length} photo(s) ajoutée(s)`);
          router.refresh();
        } else toast(r.error ?? "Erreur", "error");
      }
      if (input.current) input.current.value = "";
    });

  return (
    <div className="mt-3">
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => upload(Array.from(e.target.files ?? []))}
        aria-label="Ajouter des photos"
      />
      <Button type="button" variant="ghost" loading={pending} disabled={count >= MAX_PHOTOS} className="px-3 py-1.5 text-xs" onClick={() => input.current?.click()}>
        <Camera size={14} aria-hidden="true" /> Ajouter des photos
      </Button>
    </div>
  );
}

/** Compare les photos départ / retour (Edge Function damage-check). Suggestion à valider par un humain. */
function DamageCheck({ contractId, canEdit, stored }: { contractId: string; canEdit: boolean; stored: AiFindings }) {
  const toast = useToast();
  const router = useRouter();
  const [result, setResult] = useState<AiFindings>(stored);
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("damage-check", { body: { contract_id: contractId } });
      if (error) {
        let msg = "L'analyse IA est indisponible.";
        try {
          const p = await (error as { context?: Response }).context?.json();
          msg = p?.error === "ai_disabled" ? "L'IA n'est pas configurée (secret GEMINI_API_KEY manquant)." : (p?.error ?? msg);
        } catch {
          /* corps non JSON */
        }
        return toast(msg, "error");
      }
      setResult(data as AiFindings);
      router.refresh();
    });

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold"><Sparkles size={17} className="text-brand-violet" aria-hidden="true" /> Contrôle des dommages</h2>
        <Badge tone="violet">Suggestion IA</Badge>
      </div>
      {result ? (
        <div className="mt-3 space-y-2 text-sm">
          {result.summary && <p>{result.summary}</p>}
          {result.findings?.length ? (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {result.findings.map((f, i) => (
                <li key={i} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <span><span className="font-medium">{f.zone ?? "Zone"}</span> — {f.description}</span>
                  <Badge tone="warning">{Math.round((f.confidence ?? 0) * 100)} %</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">Aucun nouveau dommage détecté.</p>
          )}
          <p className="text-xs text-muted">Résultat indicatif : à valider par un agent avant toute facturation de dommages.</p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">Compare les photos de départ et de retour pour repérer d&apos;éventuels dommages.</p>
      )}
      {canEdit && (
        <Button type="button" variant="ghost" loading={pending} className="mt-4 text-xs" onClick={run}>
          {result ? "Relancer l'analyse" : "Analyser les photos"}
        </Button>
      )}
    </Card>
  );
}
