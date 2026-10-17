import { cn } from "@/lib/utils";

const TONES = {
  violet: "border-brand-violet/30 bg-brand-violet/15 text-brand-violet",
  blue: "border-brand-blue/30 bg-brand-blue/15 text-brand-blue",
  cyan: "border-brand-cyan/30 bg-brand-cyan/15 text-brand-cyan",
  success: "border-success/30 bg-success/15 text-success",
  danger: "border-danger/30 bg-danger/15 text-danger",
  warning: "border-warning/30 bg-warning/15 text-warning",
  muted: "border-white/10 bg-white/5 text-muted",
} as const;

export function Badge({
  tone = "violet",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof TONES }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
