"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth/session";
import type { ActionState } from "@/components/action-form";

// These use the signed-in admin's own session (not the secret key), so the audit log records who made each change.

function fields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    is_securitas: formData.get("is_securitas") === "on",
    salespeople_enter_own_cards: formData.get("salespeople_enter_own_cards") === "on",
    active: formData.get("active") === "on",
  };
}

function message(error: { code?: string; message: string }) {
  return error.code === "23505" ? "A dealership with that name already exists." : "Could not save. Please try again.";
}

export async function addDealership(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const f = fields(formData);
  if (!f.name) return { error: "Enter a dealership name." };
  const { error } = await (await createClient()).from("dealerships").insert({ ...f, active: true });
  if (error) return { error: message(error) };
  revalidatePath("/admin/dealerships");
  return { notice: `Added ${f.name}.` };
}

export async function saveDealership(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  const f = fields(formData);
  if (!f.name) return { error: "Enter a dealership name." };
  const { error } = await (await createClient()).from("dealerships").update(f).eq("id", id);
  if (error) return { error: message(error) };
  revalidatePath("/admin/dealerships");
  return { notice: "Saved." };
}
