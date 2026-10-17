"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Loader2, RotateCcw, Send, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

type ToolCall = { tool: string; input?: unknown; result?: { draft_booking?: { id?: string }; error?: string } };
type Msg = { id: number; role: "user" | "assistant"; text: string; drafts?: string[]; error?: boolean };

const SUGGESTIONS = [
  "Quelles voitures sont libres vendredi à Tunis ?",
  "Montre-moi les SUV disponibles ce week-end",
];

/**
 * Assistant en langage naturel (Edge Function ai-assistant, modèle Gemini).
 * - s'exécute avec le JWT de l'utilisateur : la RLS s'applique ;
 * - ne confirme JAMAIS une réservation : il crée un brouillon « en attente » à valider dans Réservations ;
 * - toute réponse est étiquetée « Suggestion IA ».
 */
export function ChatPanel() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const endRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const push = (m: Omit<Msg, "id">) => setMessages((cur) => [...cur, { ...m, id: nextId.current++ }]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    push({ role: "user", text: message });
    setBusy(true);

    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("ai-assistant", {
      body: { message, conversation_id: conversationId },
    });

    if (error) {
      let payload: { error?: string; message?: string } = {};
      try {
        payload = await (error as { context?: Response }).context?.json();
      } catch {
        /* corps non JSON */
      }
      if (payload.error === "ai_disabled") {
        setDisabled(true);
      } else {
        push({ role: "assistant", error: true, text: payload.error ?? "L'assistant est momentanément indisponible." });
      }
      setBusy(false);
      return;
    }

    setConversationId(data.conversation_id);
    const drafts = ((data.tool_calls ?? []) as ToolCall[])
      .filter((t) => t.tool === "create_booking_draft" && t.result?.draft_booking?.id)
      .map((t) => t.result!.draft_booking!.id!);
    push({ role: "assistant", text: data.message, drafts });
    setBusy(false);
  }

  if (disabled) {
    return (
      <Card className="flex items-start gap-3 p-5">
        <Bot size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
        <div className="text-sm text-muted">
          <p className="font-medium text-text">Assistant conversationnel désactivé</p>
          <p className="mt-1">
            La clé du modèle d&apos;IA n&apos;est pas configurée côté Supabase. Définis le secret{" "}
            <code className="text-brand-cyan">GEMINI_API_KEY</code> (<code>supabase secrets set …</code>). L&apos;application
            fonctionne normalement sans elle ; la recherche de disponibilités ci-dessus reste disponible.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles size={17} className="text-brand-violet" aria-hidden="true" /> Assistant en langage naturel
        </h2>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setMessages([]);
              setConversationId(undefined);
            }}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          >
            <RotateCcw size={13} aria-hidden="true" /> Nouvelle conversation
          </button>
        )}
      </div>

      <div className="max-h-[26rem] min-h-40 space-y-3 overflow-y-auto px-5 py-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-3 text-sm text-muted">
            <p>Pose une question sur les disponibilités. L&apos;assistant peut préparer un <strong className="text-text">brouillon</strong> de réservation, que tu valides ensuite.</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-r from-brand-blue to-brand-violet px-4 py-2.5 text-sm text-white"
                    : `max-w-[85%] rounded-2xl rounded-bl-md border px-4 py-2.5 text-sm ${m.error ? "border-danger/40 bg-danger/10" : "border-border bg-white/[0.04]"}`
                }
              >
                {m.role === "assistant" && !m.error && <Badge tone="violet" className="mb-1.5">Suggestion IA</Badge>}
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.drafts?.map((id) => (
                  <Link key={id} href="/bookings" className="mt-2 block text-xs font-medium text-brand-cyan hover:underline">
                    Brouillon créé — à valider dans Réservations →
                  </Link>
                ))}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {busy && (
          <p className="flex items-center gap-2 text-xs text-muted">
            <Loader2 size={14} className="animate-spin" aria-hidden="true" /> L&apos;assistant réfléchit…
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex gap-2 border-t border-border p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ex. : quelles voitures sont libres vendredi à Tunis ?"
          aria-label="Message pour l'assistant"
          maxLength={500}
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
        />
        <Button type="submit" loading={busy} disabled={!input.trim()} aria-label="Envoyer">
          <Send size={16} aria-hidden="true" />
        </Button>
      </form>
      <p className="px-5 pb-3 text-[11px] text-muted">Les réponses de l&apos;IA sont des suggestions : vérifie-les avant d&apos;agir. Les échanges sont journalisés.</p>
    </Card>
  );
}
