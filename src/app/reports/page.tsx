import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ui } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { monthLabel } from "@/lib/boards";
import { applyFilters, chosenColumns, display, isRight, pageOf, sortOf, type Params, type ReportRow } from "@/lib/reports";
import { deleteReport } from "./actions";
import { ReportFilters, type FilterLists } from "./filters";
import { SaveReport } from "./save-report";

export const instant = false;

const PAGE_SIZE = 50;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const profile = await requireUser();
  const isAdmin = profile.preset === "super_admin";
  if (!isAdmin && !profile.can_report) redirect("/");
  const sp = await searchParams;
  const supabase = await createClient();

  const cols = chosenColumns(sp, isAdmin);
  const sort = sortOf(sp);
  const page = pageOf(sp);

  const [rows, months, reps, products, sources, industries, saved] = await Promise.all([
    applyFilters(supabase.from("report_rows").select("*", { count: "exact" }), sp, isAdmin)
      .order(sort.key, { ascending: sort.asc }).order("id").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from("months").select("month_start").order("month_start", { ascending: false }),
    supabase.from("reps").select("id, first_name, last_name, dealership_id, dealerships(name)").order("last_name"),
    supabase.from("products").select("id, label").order("sort"),
    supabase.from("lead_sources").select("id, name").order("sort"),
    supabase.from("industries").select("id, name").order("name"),
    supabase.from("saved_reports").select("id, name, query").order("name"),
  ]);
  const data = (rows.data ?? []) as ReportRow[];
  const total = rows.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const repRows = (reps.data ?? []) as unknown as { id: string; first_name: string; last_name: string; dealership_id: string; dealerships: { name: string } | null }[];
  const lists: FilterLists = {
    isAdmin,
    months: ((months.data ?? []) as { month_start: string }[]).map((m) => ({ value: m.month_start, label: monthLabel(m.month_start) })),
    dealerships: [...new Map(repRows.map((r) => [r.dealership_id, r.dealerships?.name ?? ""])).entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
    reps: repRows.map((r) => ({ value: r.id, label: `${r.last_name}, ${r.first_name}` })),
    products: ((products.data ?? []) as { id: string; label: string }[]).map((x) => ({ value: x.id, label: x.label })),
    sources: ((sources.data ?? []) as { id: string; name: string }[]).map((x) => ({ value: x.id, label: x.name })),
    industries: ((industries.data ?? []) as { id: string; name: string }[]).map((x) => ({ value: x.id, label: x.name })),
  };

  // Flat copy of the URL for the form defaults, and a query string builder for links.
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (k !== "cols" && v !== undefined) flat[k] = Array.isArray(v) ? v[0]! : v;
  const colKeys = cols.map((c) => String(c.key));
  const build = (over: Record<string, string | undefined>, keepPage = false) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...flat, ...over })) if (v && k !== "page" && k !== "sort" && k !== "dir") q.set(k, v);
    if (keepPage && over.page) q.set("page", over.page);
    q.set("sort", over.sort ?? sort.key); q.set("dir", over.dir ?? (sort.asc ? "asc" : "desc"));
    colKeys.forEach((k) => q.append("cols", k));
    return q.toString();
  };
  const exportQuery = build({});

  return (
    <AppShell profile={profile}>
      <main className="mx-auto flex max-w-[1296px] flex-col gap-6 px-4 py-8 sm:px-8">
        <h1 className="text-[30px] font-extrabold tracking-tight">Reports</h1>

        <section className={`${ui.card} flex flex-col gap-[18px] p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-bold text-[#5B5F66]">Saved reports</span>
              {(saved.data ?? []).length === 0 && <span className="text-[13px] text-[#8E929A]">None yet. Choose filters and columns, then Save report.</span>}
              {((saved.data ?? []) as { id: string; name: string; query: string }[]).map((s) => (
                <span key={s.id} className="inline-flex h-9 items-center overflow-hidden rounded-full border border-[#CFD1D6] bg-white text-[13px] font-semibold">
                  <Link href={`/reports?${s.query}`} className="px-3.5 !text-[#3A3D42] hover:bg-[#F5F5F6]" style={{ lineHeight: "34px" }}>{s.name}</Link>
                  <form action={deleteReport}>
                    <input type="hidden" name="id" value={s.id} />
                    <button aria-label={`Delete saved report ${s.name}`} className="h-9 cursor-pointer border-l border-[#EEEFF1] px-2.5 text-[#8E929A] hover:bg-[#FBE7EC] hover:text-[#C8173F]">×</button>
                  </form>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <SaveReport />
              <a href={`/reports/export?format=csv&${exportQuery}`} className={`${ui.secondary} !h-[42px] !text-sm`}>Export CSV</a>
              <a href={`/reports/export?format=xlsx&${exportQuery}`} className="inline-flex h-[42px] items-center rounded-[10px] bg-[#C8173F] px-[18px] text-sm font-extrabold !text-white hover:bg-[#9E1031]">Export Excel</a>
            </div>
          </div>

          <ReportFilters lists={lists} p={flat} selected={colKeys} sort={sort.key} dir={sort.asc ? "asc" : "desc"} />

          <div className="text-[13px] text-[#5B5F66]">
            <strong className="text-[#111214]">{total.toLocaleString("en-US")} {total === 1 ? "card" : "cards"}</strong> match
            {total > PAGE_SIZE && <> · showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, total)}</>}
          </div>

          <div className="overflow-x-auto rounded-[14px] border border-[#E6E7EA]">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="bg-[#F5F5F6] text-left">
                  {cols.map((c) => {
                    const on = sort.key === c.key;
                    return (
                      <th key={String(c.key)} scope="col" aria-sort={on ? (sort.asc ? "ascending" : "descending") : undefined}
                        className={`whitespace-nowrap px-3.5 py-3 text-xs font-bold tracking-[0.04em] text-[#5B5F66] ${isRight(c.kind) ? "text-right" : ""}`}>
                        <Link href={`/reports?${build({ sort: String(c.key), dir: on && !sort.asc ? "asc" : on ? "desc" : isRight(c.kind) ? "desc" : "asc" })}`}
                          className={`uppercase ${on ? "!text-[#111214]" : "!text-[#5B5F66]"} hover:underline`}>
                          {c.label}{on ? (sort.asc ? " ↑" : " ↓") : ""}
                        </Link>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={cols.length} className="px-3.5 py-10 text-center text-[#5B5F66]">No cards match these filters.</td></tr>
                ) : data.map((r) => (
                  <tr key={r.id} className="border-t border-[#EEEFF1]">
                    {cols.map((c) => (
                      <td key={String(c.key)} className={`px-3.5 py-[13px] ${isRight(c.kind) ? "text-right tabular-nums" : ""} ${c.key === "rep" || c.key === "tcv" || c.key === "points" ? "font-bold" : ""} ${c.key === "sale_date" ? "whitespace-nowrap text-[#5B5F66]" : ""}`}>
                        {display(c, r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-[#5B5F66]">
            <span>Exports include every selected column and never include login data.</span>
            <span className="flex items-center gap-3">
              {page > 1 && <Link href={`/reports?${build({ page: String(page - 1) }, true)}`} className="font-semibold !text-[#C8173F] hover:underline">← Previous</Link>}
              <span>Page {Math.min(page, pages)} of {pages}</span>
              {page < pages && <Link href={`/reports?${build({ page: String(page + 1) }, true)}`} className="font-semibold !text-[#C8173F] hover:underline">Next →</Link>}
            </span>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
