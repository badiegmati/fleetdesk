import { cn } from "@/lib/utils";

type FormMessageProps = {
  error?: string;
  info?: string;
  className?: string;
};

/** Message d'erreur (annoncé aux lecteurs d'écran) ou d'information. */
export function FormMessage({ error, info, className }: FormMessageProps) {
  if (error) {
    return (
      <p role="alert" className={cn("text-sm text-danger", className)}>
        {error}
      </p>
    );
  }
  if (info) {
    return (
      <p role="status" className={cn("text-sm text-success", className)}>
        {info}
      </p>
    );
  }
  return null;
}
