"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/components/action-form";

/** Saves the current filters and columns under a name, for this person only. */
export async function saveReport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireUser();
  if (!profile.can_report && profile.preset !== "super_admin") return { error: "You cannot save reports." };
  const name = String(formData.get("name") ?? "").trim();
  const query = String(formData.get("query") ?? "");
  if (!name) return { error: "Give the report a name." };
  if (name.length > 80) return { error: "That name is too long." };
  const params = new URLSearchParams(query);
  params.delete("page");
  const { error } = await (await createClient()).from("saved_reports").upsert({ owner_id: profile.id, name, query: params.toString() }, { onConflict: "owner_id,name" });
  if (error) return { error: "Could not save the report. Please try again." };
  revalidatePath("/reports");
  return { notice: `Saved “${name}”.` };
}

export async function deleteReport(formData: FormData) {
  const profile = await requireUser();
  await (await createClient()).from("saved_reports").delete().eq("id", String(formData.get("id") ?? "")).eq("owner_id", profile.id);
  revalidatePath("/reports");
}
