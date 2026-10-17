"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Area, AreaChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarClock, Car, Gauge, Sparkles, Wallet, Wrench } from "lucide-react";
import { AnimatedCounter } from "@/components/motion/AnimatedCounter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { fmtDateTime } from "@/lib/format";
import { fadeUp, stagger } from "@/lib/motion";
import { seedDemo } from "./actions";

export type DayPoint = { label: string; reel: number | null; prevu: number | null };
export type ForecastPoint = { label: string; reel: number | null; prevu: number | null; band: [number, number] | null };
export type TodayItem = { id: string; customer: string; vehicle: string; at: string };

type Props = {
  isEmpty: boolean; isAdmin: boolean;
  kpis: { occupancy: number; revenue: number; returns: number; maintenance: number; fleet: number };
  series: DayPoint[]; forecast: ForecastPoint[] | null; returns: TodayItem[]; departures: TodayItem[]; currency: string;
};

export function DashboardView({ isEmpty, isAdmin, kpis, series, forecast, returns, departures, currency }: Props) {
  const toast = useToast();
  const [pending, start] = useTransition();

  if (isEmpty) {
    return (
      <EmptyState
        icon={Car}
        title="Bienvenue sur FleetDesk"
        text={
          isAdmin
            ? "Ta société est vide. Charge un jeu de données de démo (agences, véhicules, clients, réservations, factures) ou commence par créer ta première agence."
            : "Aucune donnée pour l'instant. Demande à l'administrateur de ta société de configurer les agences et la flotte."
        }
        action={
          isAdmin ? (
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              <Button
                loading={pending}
                onClick={() =>
                  start(async () => {
                    const r = await seedDemo();
                    toast(r.ok ? "Données de démo chargées" : (r.error ?? "Erreur"), r.ok ? "success" : "error");
                  })
                }
              >
                <Sparkles size={16} aria-hidden="true" /> Charger la démo
              </Button>
              <Link href="/settings/agencies" className="inline-flex items-center rounded-xl border border-border px-4 py-2.5 text-sm hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue">
                Créer une agence
              </Link>
            </div>
          ) : undefined
        }
      />
    );
  }

  const cards = [
    { label: "Taux d'occupation", icon: Gauge, node: <AnimatedCounter value={kpis.occupancy} suffix=" %" />, hint: `sur ${kpis.fleet} véhicule(s)` },
    { label: "CA du mois", icon: Wallet, node: <AnimatedCounter value={kpis.revenue} decimals={0} suffix={` ${currency}`} />, hint: "réservations du mois (HT)" },
    { label: "Retours du jour", icon: CalendarClock, node: <AnimatedCounter value={kpis.returns} />, hint: "locations à clôturer" },
    { label: "En maintenance", icon: Wrench, node: <AnimatedCounter value={kpis.maintenance} />, hint: "véhicule(s) immobilisé(s)" },
  ];

  return (
    <motion.div variants={stagger(0, 0.07)} initial="hidden" animate="visible" className="space-y-8">
      <motion.div variants={fadeUp} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-5">
            <div className="flex items-center justify-between text-sm text-muted">
              {c.label}
              <c.icon size={16} className="text-brand-cyan" aria-hidden="true" />
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">{c.node}</p>
            <p className="mt-1 text-xs text-muted">{c.hint}</p>
          </Card>
        ))}
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card className="p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-semibold">Occupation de la flotte</h2>
              <p className="text-xs text-muted">7 derniers jours (réel) et 7 prochains jours (réservations déjà enregistrées).</p>
            </div>
            <ul className="flex gap-4 text-xs text-muted" aria-label="Légende">
              <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-brand-blue" />Réel</li>
              <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-brand-violet" />Réservé</li>
            </ul>
          </div>
          <div className="mt-4 h-64 w-full" role="img" aria-label="Courbe du taux d'occupation sur 15 jours">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="gReel" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gPrevu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} interval={1} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: "#0a1020", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                  formatter={(v) => `${v} %`}
                />
                <ReferenceLine x={series[7]?.label} stroke="rgba(255,255,255,0.25)" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="reel" name="Réel" stroke="#3b82f6" strokeWidth={2} fill="url(#gReel)" connectNulls={false} />
                <Area type="monotone" dataKey="prevu" name="Réservé" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 4" fill="url(#gPrevu)" connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold">Demande : réel vs prévu</h2>
              <p className="text-xs text-muted">Nouvelles réservations par jour de départ, avec intervalle de prévision.</p>
            </div>
            {forecast && <span className="rounded-full border border-brand-violet/30 bg-brand-violet/15 px-2.5 py-0.5 text-xs text-brand-violet">Suggestion IA</span>}
          </div>
          {forecast ? (
            <div className="mt-4 h-64 w-full" role="img" aria-label="Courbe de la demande réelle et prévue avec intervalle">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={forecast} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} interval={3} />
                  <YAxis allowDecimals={false} tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "#0a1020", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }} />
                  <ReferenceLine x={forecast[14]?.label} stroke="rgba(255,255,255,0.25)" strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="band" name="Intervalle" stroke="none" fill="#8b5cf6" fillOpacity={0.18} connectNulls={false} />
                  <Line type="monotone" dataKey="reel" name="Réel" stroke="#06b6d4" strokeWidth={2} dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="prevu" name="Prévu" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">
              Aucune prévision pour l&apos;instant. Elles sont calculées chaque nuit par la fonction <code className="text-brand-cyan">forecast-demand</code>{" "}
              (pg_cron) : planifie-la comme indiqué dans <code>supabase/README</code>, ou lance-la une première fois à la main.
            </p>
          )}
        </Card>
      </motion.div>

      <motion.div variants={fadeUp} className="grid gap-6 lg:grid-cols-2">
        <TodayList title="Retours du jour" empty="Aucun retour prévu aujourd'hui." items={returns} />
        <TodayList title="Départs du jour" empty="Aucun départ prévu aujourd'hui." items={departures} />
      </motion.div>
    </motion.div>
  );
}

function TodayList({ title, empty, items }: { title: string; empty: string; items: TodayItem[] }) {
  return (
    <Card className="p-5">
      <h2 className="font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div>
                <p className="font-medium">{i.customer}</p>
                <p className="text-xs text-muted">{i.vehicle}</p>
              </div>
              <span className="text-xs text-brand-cyan">{fmtDateTime(i.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
