"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** The database raises plain-English errors; show those, and hide anything unexpected. */
function friendly(message: string) {
  return /^(You |Please |Enter |Choose |That |This |Card |Only |Audit |A |Invalid )/.test(message) ? message : "Something went wrong. Please try again.";
}

type Result = { error?: string; ok?: boolean };

export async function startAudit(month: string): Promise<Result> {
  await requireSuperAdmin();
  const { error } = await (await createClient()).rpc("start_audit", { p_month: month });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/audit");
  return { ok: true };
}

export async function finalizeMonth(month: string): Promise<Result> {
  await requireSuperAdmin();
  const { error } = await (await createClient()).rpc("finalize_month", { p_month: month });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/audit");
  return { ok: true };
}

export async function reopenMonth(month: string, reason: string): Promise<Result> {
  await requireSuperAdmin();
  const { error } = await (await createClient()).rpc("reopen_month", { p_month: month, p_reason: reason });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/audit");
  return { ok: true };
}

export type Adjustment = {
  cardId: string;
  reason: string;
  newLogo?: "true" | "false" | "auto";
  customerType?: "existing" | "new_logo" | "residential";
  points?: number | "auto";
};

export async function adjustCard(a: Adjustment): Promise<Result> {
  await requireSuperAdmin();
  const p: Record<string, unknown> = { card_id: a.cardId, reason: a.reason };
  if (a.newLogo) p.new_logo = a.newLogo === "auto" ? "auto" : a.newLogo === "true";
  if (a.customerType) p.customer_type = a.customerType;
  if (a.points !== undefined) p.points = a.points;
  const { error } = await (await createClient()).rpc("audit_adjust", { p });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/audit");
  return { ok: true };
}

/** Mark a card approved, then go to the next card in the queue (or stay if there is none). */
export async function approveCard(cardId: string, next: string): Promise<Result> {
  await requireSuperAdmin();
  const { error } = await (await createClient()).rpc("audit_approve", { p_card: cardId });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/audit");
  redirect(next.startsWith("/audit") ? next : "/audit");
}

export async function markAlertsRead(): Promise<void> {
  await requireSuperAdmin();
  await (await createClient()).from("alerts").update({ read_at: new Date().toISOString() }).is("read_at", null);
  revalidatePath("/", "layout");
}
