"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth/session";
import type { CatalogProduct } from "@/lib/import/cards-plan";

// Runs as the signed-in super admin. The database functions do the real work and check the same thing again.

export type ImportContext = { products: CatalogProduct[]; reps: number[]; dealerships: number[]; openMonths: { month: string; cards: number }[] };

/** What the preview needs to know: the scoring catalog, who and which dealerships are already imported, and which months are still open. */
export async function importContext(): Promise<ImportContext> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const [{ data: products }, { data: reps }, { data: dealerships }, { data: months }] = await Promise.all([
    supabase.from("products").select("key, points, needs_audio_sensor"),
    supabase.from("reps").select("legacy_id").not("legacy_id", "is", null).limit(5000),
    supabase.from("dealerships").select("legacy_id").not("legacy_id", "is", null).limit(1000),
    supabase.from("months").select("month_start").eq("status", "open").order("month_start"),
  ]);
  const open = await Promise.all((months ?? []).map(async (m) => {
    const { count } = await supabase.from("tally_cards").select("id", { count: "exact", head: true }).eq("entry_month", m.month_start).not("legacy_id", "is", null);
    return { month: String(m.month_start), cards: count ?? 0 };
  }));
  return {
    products: (products ?? []).map((p) => ({ key: String(p.key), points: Number(p.points), needs_audio_sensor: Boolean(p.needs_audio_sensor) })),
    reps: (reps ?? []).map((r) => Number(r.legacy_id)),
    dealerships: (dealerships ?? []).map((d) => Number(d.legacy_id)),
    openMonths: open.filter((o) => o.cards > 0),
  };
}

/** Which of these old card IDs are already imported. */
export async function existingCards(ids: number[]): Promise<number[]> {
  await requireSuperAdmin();
  const clean = ids.filter((n) => Number.isInteger(n) && n > 0).slice(0, 5000);
  const { data, error } = await (await createClient()).rpc("import_existing_cards", { p_ids: clean });
  if (error) throw new Error("Could not check the cards already imported.");
  return (data as number[] | null) ?? [];
}

export type BatchResult = { inserted: number; skipped: number; overrides: number; errors: { legacy_id: string; error: string }[] };

/** One batch of cards (up to 100 at a time from the screen). Cards already imported are skipped. */
export async function importCardsBatch(rows: unknown[], mode: "recorded" | "calculate"): Promise<BatchResult> {
  await requireSuperAdmin();
  const { data, error } = await (await createClient()).rpc("import_cards", { p_rows: rows.slice(0, 200), p_mode: mode });
  if (error) throw new Error("The batch could not be imported.");
  return data as BatchResult;
}

/** Lock the calculated months up to and including this one, saving their rankings. */
export async function finalizeImportedMonths(through: string): Promise<{ months?: number; error?: string }> {
  await requireSuperAdmin();
  if (!/^\d{4}-\d{2}-01$/.test(through)) return { error: "Choose a month." };
  const { data, error } = await (await createClient()).rpc("import_finalize_months", { p_through: through });
  if (error) return { error: "Could not lock those months." };
  revalidatePath("/audit");
  revalidatePath("/leaderboards");
  return { months: Number(data) };
}
