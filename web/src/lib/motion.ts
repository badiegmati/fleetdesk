import type { Transition, Variants } from "framer-motion";

export const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

export const SPRING_SOFT: Transition = {
  type: "spring",
  damping: 28,
  stiffness: 300,
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_EXPO } },
};

export const stagger = (delay = 0, child = 0.06): Variants => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { delayChildren: delay, staggerChildren: child },
  },
});

export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE_EXPO } },
};
