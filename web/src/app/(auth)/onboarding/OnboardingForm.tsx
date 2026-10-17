"use client";

import { useActionState } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormMessage } from "@/components/auth/FormMessage";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { createCompany, type ActionState } from "../actions";

const initialState: ActionState = {};

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createCompany, initialState);

  return (
    <AuthCard
      title="Crée ta société"
      subtitle="Dernière étape : tu deviens l'administrateur de ta société sur FleetDesk."
    >
      <form action={action} className="space-y-4">
        <Field
          id="company"
          label="Nom de la société"
          required
          minLength={2}
          autoComplete="organization"
          placeholder="Ex. Sahara Location"
        />
        <Field
          id="fullName"
          label="Ton nom complet"
          required
          minLength={2}
          autoComplete="name"
        />

        <FormMessage error={state.error} />

        <Button type="submit" loading={pending} className="w-full">
          {pending ? "Création…" : "Créer la société"}
        </Button>
      </form>
    </AuthCard>
  );
}
