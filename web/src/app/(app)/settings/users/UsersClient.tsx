"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Mail, UserPlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormAlert } from "@/components/ui/form-alert";
import { Field, MiniSelect, SelectField } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useFormAction } from "@/components/ui/useFormAction";
import { ROLES, ROLE_LABELS, toRole } from "@/lib/rbac";
import { fadeUp, stagger } from "@/lib/motion";
import type { Agency, Member } from "@/types/db";
import { deleteInvitation, inviteUser, updateMember } from "../actions";

export type InvitationRow = { id: string; email: string; role: string; agency_id: string | null; created_at: string; expires_at: string };

export function UsersClient({
  meId, members, invitations, agencies,
}: { meId: string; members: Member[]; invitations: InvitationRow[]; agencies: Agency[] }) {
  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="font-semibold">Équipe</h2>
        <motion.ul variants={stagger(0, 0.04)} initial="hidden" animate="visible" className="mt-3 divide-y divide-border">
          {members.map((m) => (
            <motion.li key={m.id} variants={fadeUp}>
              <MemberRow member={m} isMe={m.id === meId} agencies={agencies} />
            </motion.li>
          ))}
        </motion.ul>
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-semibold"><UserPlus size={17} aria-hidden="true" /> Inviter un utilisateur</h2>
        <p className="mt-1 text-sm text-muted">
          La personne crée son compte avec cet e-mail (page « Créer un compte ») : elle est rattachée automatiquement à ta société avec le rôle choisi. L'invitation est valable 7 jours ; la renvoyer la renouvelle.
        </p>
        <InviteForm agencies={agencies} />

        {invitations.length > 0 && (
          <ul className="mt-5 divide-y divide-border border-t border-border">
            {invitations.map((i) => (
              <InvitationItem key={i.id} inv={i} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function MemberRow({ member, isMe, agencies }: { member: Member; isMe: boolean; agencies: Agency[] }) {
  const { state, formAction, pending } = useFormAction(updateMember, { successMessage: "Utilisateur mis à jour" });
  const [dirty, setDirty] = useState(false);
  return (
    <form
      action={(fd) => {
        setDirty(false);
        formAction(fd);
      }}
      className="py-3"
    >
      <input type="hidden" name="id" value={member.id} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-40 flex-1">
          <p className="font-medium">{member.full_name ?? "Sans nom"}{isMe && <Badge tone="violet" className="ml-2">Toi</Badge>}</p>
        </div>
        <MiniSelect name="role" defaultValue={toRole(member.role)} disabled={isMe} onChange={() => setDirty(true)} aria-label="Rôle">
          {ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </MiniSelect>
        <MiniSelect name="agency_id" defaultValue={member.agency_id ?? ""} disabled={isMe} onChange={() => setDirty(true)} aria-label="Agence">
          <option value="">Toutes les agences</option>
          {agencies.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </MiniSelect>
        {!isMe && (
          <Button type="submit" variant="ghost" loading={pending} disabled={!dirty} className="px-3 py-1.5 text-xs">
            Enregistrer
          </Button>
        )}
      </div>
      {state.error && <div className="mt-2"><FormAlert error={state.error} nonce={state.nonce} /></div>}
    </form>
  );
}

function InviteForm({ agencies }: { agencies: Agency[] }) {
  const [formKey, setFormKey] = useState(0);
  const { state, formAction, pending } = useFormAction(inviteUser, {
    successMessage: "Invitation enregistrée",
    onSuccess: () => setFormKey((k) => k + 1),
  });
  return (
    <form key={formKey} action={formAction} className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="email" label="E-mail" type="email" required placeholder="collegue@exemple.com" />
        <SelectField id="role" label="Rôle" defaultValue="agent">
          {ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </SelectField>
        <SelectField id="agency_id" label="Agence" defaultValue="">
          <option value="">Toutes les agences</option>
          {agencies.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </SelectField>
      </div>
      <FormAlert error={state.error} nonce={state.nonce} />
      <Button type="submit" loading={pending}>Inviter</Button>
    </form>
  );
}

function InvitationItem({ inv }: { inv: InvitationRow }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <li className="flex items-center justify-between gap-3 py-3 text-sm">
      <span className="flex items-center gap-2"><Mail size={14} className="text-muted" aria-hidden="true" />{inv.email}</span>
      <span className="flex items-center gap-3">
        {new Date(inv.expires_at).getTime() < Date.now() ? (
          <Badge tone="danger">Expirée · {ROLE_LABELS[toRole(inv.role)]}</Badge>
        ) : (
          <Badge tone="warning">En attente · {ROLE_LABELS[toRole(inv.role)]}</Badge>
        )}
        <button
          type="button"
          disabled={pending}
          aria-label={`Annuler l'invitation de ${inv.email}`}
          onClick={() =>
            start(async () => {
              const r = await deleteInvitation(inv.id);
              toast(r.ok ? "Invitation annulée" : (r.error ?? "Erreur"), r.ok ? "success" : "error");
            })
          }
          className="rounded-lg p-1.5 text-muted hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
        >
          <X size={15} />
        </button>
      </span>
    </li>
  );
}
