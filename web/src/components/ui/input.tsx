import { cn } from "@/lib/utils";

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  hint?: string;
};

/** Champ de formulaire accessible : libellé relié, aide optionnelle. */
export function Field({ id, label, hint, className, ...props }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-muted">
        {label}
      </label>
      <input
        id={id}
        name={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn(
          "w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-text",
          "placeholder:text-muted/60 outline-none transition-shadow",
          "focus-visible:ring-2 focus-visible:ring-brand-blue",
          className,
        )}
        {...props}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted/80">
          {hint}
        </p>
      )}
    </div>
  );
}

const CONTROL =
  "w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-text outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-brand-blue";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  id: string;
  label: string;
  children: React.ReactNode;
};

export function SelectField({ id, label, className, children, ...props }: SelectProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-muted">
        {label}
      </label>
      <select id={id} name={id} className={cn(CONTROL, "appearance-none", className)} {...props}>
        {children}
      </select>
    </div>
  );
}

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { id: string; label: string };

export function TextareaField({ id, label, className, ...props }: TextareaProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-muted">
        {label}
      </label>
      <textarea id={id} name={id} rows={3} className={cn(CONTROL, "resize-none", className)} {...props} />
    </div>
  );
}

/** Petit sélecteur compact pour filtres et lignes de tableau. */
export function MiniSelect({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
        className,
      )}
      {...props}
    />
  );
}
