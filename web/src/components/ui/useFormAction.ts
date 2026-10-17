"use client";

import { useActionState, useEffect, useRef } from "react";
import { useToast } from "@/components/ui/toast";
import type { FormState } from "@/lib/form";

/** useActionState + toast de succès + callback (fermeture de la boîte de dialogue). */
export function useFormAction(
  action: (prev: FormState, fd: FormData) => Promise<FormState>,
  opts: { successMessage?: string; onSuccess?: () => void } = {},
) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const toast = useToast();
  const handled = useRef<number | undefined>(undefined);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (state.ok && state.nonce !== handled.current) {
      handled.current = state.nonce;
      if (optsRef.current.successMessage) toast(optsRef.current.successMessage, "success");
      if (state.info) toast(state.info, "success");
      if (state.warning) toast(state.warning, "error");
      optsRef.current.onSuccess?.();
    }
  }, [state, toast]);

  return { state, formAction, pending };
}
