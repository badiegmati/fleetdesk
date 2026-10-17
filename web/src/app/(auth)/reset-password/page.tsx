"use client";

import { useActionState } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormMessage } from "@/components/auth/FormMessage";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { updatePassword, type ActionState } from "../actions";

const initialState: ActionState = {};

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState(updatePassword, initialState);

  return (
    <AuthCard title="Nouveau mot de passe" subtitle="Choisis un mot de passe d'au moins 8 caractères.">
      <form action={action} className="space-y-4">
        <Field
          id="password"
          label="Nouveau mot de passe"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <Field
          id="confirm"
          label="Confirmer le mot de passe"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />

        <FormMessage error={state.error} />

        <Button type="submit" loading={pending} className="w-full">
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </form>
    </AuthCard>
  );
}
