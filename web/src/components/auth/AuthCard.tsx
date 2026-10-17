"use client";

import { motion } from "framer-motion";
import { Logo } from "@/components/layout/Logo";
import { Card } from "@/components/ui/card";
import { fadeUp, stagger } from "@/lib/motion";

type AuthCardProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <motion.div
      variants={stagger(0.05, 0.08)}
      initial="hidden"
      animate="visible"
      className="w-full max-w-md"
    >
      <motion.div variants={fadeUp} className="mb-8 text-center">
        <Logo className="text-3xl font-black tracking-tight" />
      </motion.div>

      <Card className="p-8">
        <motion.h1 variants={fadeUp} className="text-2xl font-bold">
          {title}
        </motion.h1>
        {subtitle && (
          <motion.p variants={fadeUp} className="mt-1 text-sm text-muted">
            {subtitle}
          </motion.p>
        )}
        <motion.div variants={fadeUp} className="mt-6">
          {children}
        </motion.div>
      </Card>

      {footer && (
        <motion.div variants={fadeUp} className="mt-5 text-center text-sm text-muted">
          {footer}
        </motion.div>
      )}
    </motion.div>
  );
}
