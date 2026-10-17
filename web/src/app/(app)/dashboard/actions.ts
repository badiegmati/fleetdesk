"use server";

import { revalidatePath } from "next/cache";
import { getCtx } from "@/lib/ctx";
import { dbError, fail, ok, type FormState } from "@/lib/form";

export async function seedDemo(): Promise<FormState> {
  const { supabase } = await getCtx();
  const { error } = await supabase.rpc("seed_demo_data");
  if (error) return fail(dbError(error));
  revalidatePath("/", "layout");
  return ok();
}
