"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth/session";
import type { ActionState } from "@/components/action-form";

function fields(formData: FormData) {
  return {
    first_name: String(formData.get("first_name") ?? "").trim(),
    last_name: String(formData.get("last_name") ?? "").trim(),
    dealership_id: String(formData.get("dealership_id") ?? ""),
  };
}

export async function saveRep(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  const f = fields(formData);
  if (!f.first_name || !f.last_name || !f.dealership_id) return { error: "Enter a first name, last name and dealership." };
  const { error } = await (await createClient())
    .from("reps")
    .update({ ...f, active: formData.get("active") === "on" })
    .eq("id", id);
  if (error) return { error: "Could not save. Please try again." };
  revalidatePath("/admin/users");
  return { notice: "Saved." };
}
