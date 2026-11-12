import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { applyFilters, chosenColumns, fileValue, sortOf, type Params, type ReportRow } from "@/lib/reports";

const BATCH = 1000;
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Downloads the report the URL describes, as CSV or Excel. Same filters, same columns, same access rules as the screen. */
export async function GET(req: Request) {
  const profile = await requireUser();
  const isAdmin = profile.preset === "super_admin";
  if (!isAdmin && !profile.can_report) return new NextResponse("Not allowed", { status: 403 });

  const url = new URL(req.url);
  const sp: Params = {};
  for (const k of new Set(url.searchParams.keys())) { const all = url.searchParams.getAll(k); sp[k] = all.length > 1 ? all : all[0]; }
  const cols = chosenColumns(sp, isAdmin);
  const sort = sortOf(sp);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  const supabase = await createClient();
  const rows: ReportRow[] = [];
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await applyFilters(supabase.from("report_rows").select("*"), sp, isAdmin)
      .order(sort.key, { ascending: sort.asc }).order("id").range(from, from + BATCH - 1);
    if (error) return new NextResponse("Could not build the report.", { status: 500 });
    rows.push(...((data ?? []) as ReportRow[]));
    if (!data || data.length < BATCH) break;
    if (rows.length >= 50000) break;
  }

  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  if (format === "csv") {
    const lines = [cols.map((c) => csvCell(c.label)).join(",")];
    for (const r of rows) lines.push(cols.map((c) => csvCell(fileValue(c, r, false))).join(","));
    return new NextResponse("﻿" + lines.join("\r\n") + "\r\n", {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="titan-report-${stamp}.csv"` },
    });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Report", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = cols.map((c) => ({
    header: c.label, key: String(c.key),
    width: c.kind === "money" || c.kind === "int" ? 12 : c.kind === "date" || c.kind === "month" ? 13 : c.key === "products" || c.key === "comments" || c.key === "lead_sources" ? 40 : 22,
    style: c.kind === "money" ? { numFmt: '"$"#,##0.00' } : c.kind === "date" ? { numFmt: "yyyy-mm-dd" } : c.kind === "month" ? { numFmt: "mmm yyyy" } : undefined,
  }));
  for (const r of rows) ws.addRow(Object.fromEntries(cols.map((c) => [String(c.key), fileValue(c, r, true)])));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111214" } };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="titan-report-${stamp}.xlsx"`,
    },
  });
}
