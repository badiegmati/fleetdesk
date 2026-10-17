"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  primary:
    "bg-gradient-to-r from-brand-blue to-brand-violet text-white shadow-lg shadow-brand-violet/20",
  ghost: "border border-border bg-white/5 text-text hover:bg-white/10",
  danger: "bg-danger/90 text-white hover:bg-danger",
} as const;

type ButtonProps = Omit<HTMLMotionProps<"button">, "children"> & {
  variant?: keyof typeof VARIANTS;
  loading?: boolean;
  children: React.ReactNode;
};

export function Button({
  variant = "primary",
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <motion.button
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      disabled={disabled || loading}
      aria-busy={loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
        "disabled:cursor-not-allowed disabled:opacity-60",
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
      {children}
    </motion.button>
  );
}
