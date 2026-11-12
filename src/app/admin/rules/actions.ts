"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/components/action-form";

const KEYS = ["rmr", "install", "new_logos", "points"];

/** Saves the tie-breaker order with the admin's own session, so the audit log records who changed it. */
export async function saveTiebreakOrder(order: string[]): Promise<ActionState> {
  await requireSuperAdmin();
  if (order.length !== 4 || !KEYS.every((k) => order.includes(k))) return { error: "Use each category once." };
  const { error } = await (await createClient()).rpc("save_tiebreak_order", { p_order: order });
  if (error) return { error: "Could not save. Please try again." };
  revalidatePath("/admin/rules");
  revalidatePath("/leaderboards");
  revalidatePath("/");
  return { notice: "Saved. Months finalized from now on will use this order." };
}
