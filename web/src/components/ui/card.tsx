import { cn } from "@/lib/utils";

/** Carte « verre dépoli » : surface sombre, bordure fine, flou d'arrière-plan. */
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-card border border-border bg-surface/80 shadow-card backdrop-blur-xl",
        className,
      )}
      {...props}
    />
  );
}
