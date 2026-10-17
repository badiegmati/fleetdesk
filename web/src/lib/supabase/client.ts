import { createBrowserClient } from "@supabase/ssr";

// Les variables NEXT_PUBLIC_* doivent être lues littéralement pour être
// injectées dans le bundle navigateur.
export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
