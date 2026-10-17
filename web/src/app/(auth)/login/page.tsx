"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormMessage } from "@/components/auth/FormMessage";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { login, type ActionState } from "../actions";

const initialState: ActionState = {};

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, initialState);

  return (
    <AuthCard
      title="Connexion"
      subtitle="Accède à l'espace de ton agence."
      footer={
        <>
          Pas encore de compte ?{" "}
          <Link href="/register" className="font-medium text-brand-cyan hover:underline">
            Créer un compte
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
          autoComplete="current-password"
        />

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-xs text-muted hover:text-white hover:underline"
          >
            Mot de passe oublié ?
          </Link>
        </div>

        <FormMessage error={state.error} />

        <Button type="submit" loading={pending} className="w-full">
          {pending ? "Connexion…" : "Se connecter"}
        </Button>
      </form>
    </AuthCard>
  );
}
