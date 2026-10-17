"use client";

import { MotionConfig } from "framer-motion";

/**
 * Applique la préférence système « réduire les animations » à toutes les
 * animations Framer Motion de l'application.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
