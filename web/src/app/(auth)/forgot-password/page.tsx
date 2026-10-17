"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormMessage } from "@/components/auth/FormMessage";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { requestPasswordReset, type ActionState } from "../actions";

const initialState: ActionState = {};

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, initialState);

  return (
    <AuthCard
      title="Mot de passe oublié"
      subtitle="Indique ton e-mail : tu recevras un lien de réinitialisation."
      footer={
        <Link href="/login" className="font-medium text-brand-cyan hover:underline">
          Retour à la connexion
        </Link>
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
        />

        <FormMessage error={state.error} info={state.info} />

        <Button type="submit" loading={pending} className="w-full">
          {pending ? "Envoi…" : "Envoyer le lien"}
        </Button>
      </form>
    </AuthCard>
  );
}
