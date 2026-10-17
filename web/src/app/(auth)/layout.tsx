export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      {/* Fond décoratif : grille de points + deux halos animés (transform uniquement) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgb(148_163_184/0.05)_1px,transparent_1px)] [background-size:28px_28px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -top-32 size-[420px] animate-orb-a rounded-full bg-brand-indigo/20 blur-[100px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -right-32 size-[380px] animate-orb-b rounded-full bg-brand-cyan/15 blur-[100px]"
      />
      <div className="relative z-10 flex w-full justify-center">{children}</div>
    </div>
  );
}
