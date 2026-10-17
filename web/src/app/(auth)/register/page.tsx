"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormMessage } from "@/components/auth/FormMessage";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { register, type ActionState } from "../actions";

const initialState: ActionState = {};

export default function RegisterPage() {
  const [state, action, pending] = useActionState(register, initialState);

  // Confirmation par e-mail activée : on invite à vérifier la boîte mail.
  if (state.info) {
    return (
      <AuthCard
        title="Vérifie ta boîte mail"
        footer={
          <Link href="/login" className="font-medium text-brand-cyan hover:underline">
            Retour à la connexion
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div className="rounded-2xl bg-brand-cyan/10 p-4 ring-1 ring-brand-cyan/30">
            <MailCheck size={28} className="text-brand-cyan" aria-hidden="true" />
          </div>
          <p role="status" className="text-sm text-muted">
            {state.info}
            {state.email && (
              <>
                <br />
                <span className="text-white">{state.email}</span>
              </>
            )}
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Créer un compte"
      subtitle="Lance FleetDesk pour ta société de location."
      footer={
        <>
          Déjà inscrit ?{" "}
          <Link href="/login" className="font-medium text-brand-cyan hover:underline">
            Se connecter
          </Link>
        </>
      }
    >
      <form action={action} className="space-y-4">
        <Field
          id="email"
          label="E-mail"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.email}
          placeholder="vous@societe.com"
        />
        <Field
          id="password"
          label="Mot de passe"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          hint="8 caractères minimum."
        />

        <FormMessage error={state.error} />

        <Button type="submit" loading={pending} className="w-full">
          {pending ? "Création…" : "Créer mon compte"}
        </Button>
      </form>
    </AuthCard>
  );
}
