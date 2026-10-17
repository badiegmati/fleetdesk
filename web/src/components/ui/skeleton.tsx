import { cn } from "@/lib/utils";

/** Squelette de chargement avec reflet animé (remplace les spinners). */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-shimmer rounded-lg bg-white/[0.04]",
        "bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.07),transparent)] bg-[length:200%_100%]",
        className,
      )}
      {...props}
    />
  );
}
