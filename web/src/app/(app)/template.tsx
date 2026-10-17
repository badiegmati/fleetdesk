"use client";

import { motion } from "framer-motion";
import { pageTransition } from "@/lib/motion";

/** Transition de page : fondu + léger déplacement vertical à chaque navigation. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div variants={pageTransition} initial="hidden" animate="visible">
      {children}
    </motion.div>
  );
}
