import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Option, ProductInfo, RepOption } from "@/lib/cards";

/** Everything the entry form needs besides the card itself. */
export async function loadFormLists() {
  const supabase = await createClient();
  const [reps, months, industries, sources, products] = await Promise.all([
    supabase.rpc("enterable_reps"),
    supabase.rpc("enterable_months"),
    supabase.from("industries").select("id, name").eq("active", true).order("sort").order("name"),
    supabase.from("lead_sources").select("id, name").eq("active", true).order("sort").order("name"),
    supabase.from("products").select("id, key, label, points, qualifies_new_logo, needs_audio_sensor").eq("active", true).order("sort"),
  ]);
  return {
    reps: ((reps.data ?? []) as { id: string; name: string; dealership_id: string; dealership: string }[]) as RepOption[],
    months: ((months.data ?? []) as { month_start: string }[]).map((m) => m.month_start),
    industries: (industries.data ?? []) as Option[],
    leadSources: (sources.data ?? []) as Option[],
    products: (products.data ?? []) as ProductInfo[],
  };
}

/** The month a new card should default to: this calendar month if open, otherwise the newest open one. */
export function defaultMonth(months: string[]) {
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  return months.includes(current) ? current : (months[0] ?? current);
}
