"use client";

import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";

/** Message d'erreur de formulaire avec secousse discrète (rejouée à chaque nouvel envoi). */
export function FormAlert({ error, nonce }: { error?: string; nonce?: number }) {
  if (!error) return null;
  return (
    <motion.div
      key={nonce}
      role="alert"
      initial={{ x: 0 }}
      animate={{ x: [0, -7, 7, -5, 5, 0] }}
      transition={{ duration: 0.4 }}
      className="flex items-start gap-2.5 rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-3 text-sm text-red-200"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
      <span>{error}</span>
    </motion.div>
  );
}
