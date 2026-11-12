import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES, monthLabel, ordered, repName, type BoardRow, type CronusRow } from "@/lib/boards";

const cell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The leaders of a finalized month as a CSV: top 5 in each category, top 10 overall, Supreme Titan and Cronus Trip. */
export async function GET(_req: Request, ctx: { params: Promise<{ month: string }> }) {
  await requireSuperAdmin();
  const { month } = await ctx.params;
  if (!/^\d{4}-\d{2}-01$/.test(month)) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const { data: m } = await supabase.from("months").select("status").eq("month_start", month).maybeSingle();
  if (!m || m.status !== "finalized") return new NextResponse("Only a finalized month can be exported.", { status: 409 });

  const [a, b, c] = await Promise.all([
    supabase.rpc("board", { p_kind: "month", p_month: month }),
    supabase.rpc("board", { p_kind: "ytd", p_month: month }),
    supabase.rpc("cronus_trip", { p_month: month }),
  ]);
  const monthly = (a.data ?? []) as BoardRow[], ytd = (b.data ?? []) as BoardRow[], cronus = (c.data ?? []) as CronusRow[];

  const lines: (string | number | null)[][] = [["Board", "Rank", "Rep", "Dealership", "Value"]];
  for (const cat of CATEGORIES) {
    for (const r of ordered(monthly, cat.rank).filter((r) => cat.rank(r)! <= 5)) {
      lines.push([`${cat.title}, ${monthLabel(month)}`, cat.rank(r), repName(r), r.dealership, cat.value(r)]);
    }
  }
  for (const r of ordered(monthly, (r) => r.overall_rank).filter((r) => r.overall_rank! <= 10)) {
    lines.push([`Overall, ${monthLabel(month)} (score)`, r.overall_rank, repName(r), r.dealership, r.score]);
  }
  for (const r of ordered(ytd, (r) => r.overall_rank).filter((r) => r.overall_rank! <= 10)) {
    lines.push([`Supreme Titan, January through ${monthLabel(month, false)} (score)`, r.overall_rank, repName(r), r.dealership, r.score]);
  }
  for (const r of cronus) lines.push([`Cronus Trip, through ${monthLabel(month, false)}`, r.slot, repName(r), r.dealership, r.reason]);

  const csv = "﻿" + lines.map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="titan-leaders-${month.slice(0, 7)}.csv"`,
    },
  });
}
