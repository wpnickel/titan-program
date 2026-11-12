import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Pill, ui } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { TYPE_LABELS, money, needsUpload, type CustomerType } from "@/lib/cards";

export const instant = false;

const monthName = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export default async function CardsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const profile = await requireUser();
  const { month: wanted } = await searchParams;
  const supabase = await createClient();

  const [{ data: monthRows }, { data: reps }] = await Promise.all([
    supabase.from("months").select("month_start, status").order("month_start", { ascending: false }).limit(24),
    supabase.rpc("enterable_reps"),
  ]);
  const months = monthRows ?? [];
  const month = months.find((m) => m.month_start === wanted) ?? months[0];

  const { data: cards } = month
    ? await supabase
        .from("tally_cards")
        .select("id, business_name, sale_date, customer_type, addendum, points, is_new_logo, is_late_entry, submitted, tcv, term_months, tally_card_files(id), reps(first_name, last_name), dealerships(name)")
        .eq("entry_month", month.month_start).is("deleted_at", null)
        .order("sale_date", { ascending: false }).order("created_at", { ascending: false }).limit(500)
    : { data: [] };
  const rows = cards ?? [];
  const { data: similarIds } = rows.length
    ? await supabase.rpc("cards_with_similar_customer", { p_cards: rows.filter((r) => r.customer_type === "new_logo" && !r.addendum).map((r) => r.id) })
    : { data: [] };
  const similar = new Set((similarIds ?? []) as unknown as string[]);
  const dealerships = new Set(rows.map((r) => (r.dealerships as unknown as { name: string }).name));
  const totalPoints = rows.reduce((s, r) => s + r.points, 0);
  const canEnter = (reps ?? []).length > 0;

  return (
    <AppShell profile={profile}>
      <main className="mx-auto flex max-w-[1296px] flex-col gap-6 px-4 py-8 sm:px-8">
        <div className="flex flex-wrap items-center gap-3.5">
          <h1 className="text-[30px] font-extrabold tracking-tight">Tally cards</h1>
          {month && <Pill>{month.status === "open" ? "Open" : month.status === "in_audit" ? "In audit" : "Finalized"}</Pill>}
          <div className="flex-1" />
          {canEnter && <Link href="/cards/new" className={ui.primary}>+ New tally card</Link>}
        </div>

        {months.length > 0 && (
          <nav aria-label="Month" className="flex flex-wrap gap-1.5">
            {months.map((m) => (
              <Link key={m.month_start} href={`/cards?month=${m.month_start}`}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${m.month_start === month?.month_start ? "bg-[#111214] text-white" : "border border-[#CFD1D6] bg-white text-[#3A3D42] hover:border-[#111214]"}`}>
                {monthName(m.month_start)}
              </Link>
            ))}
          </nav>
        )}

        <section className={`${ui.card} overflow-hidden`}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-[#EEEFF1] px-5 py-3.5 text-sm text-[#5B5F66]">
            <span><b className="text-[#111214]">{rows.length}</b> {rows.length === 1 ? "card" : "cards"}</span>
            <span><b className="text-[#111214]">{totalPoints}</b> points</span>
            <span><b className="text-[#111214]">{rows.filter((r) => r.is_new_logo).length}</b> new logos</span>
          </div>
          {rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-[#5B5F66]">No tally cards in {month ? monthName(month.month_start) : "this month"} yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#EEEFF1] text-xs font-bold tracking-wide text-[#5B5F66]">
                    <th className="px-5 py-3">Business</th>
                    <th className="px-3 py-3">Rep</th>
                    {dealerships.size > 1 && <th className="px-3 py-3">Dealership</th>}
                    <th className="px-3 py-3">Sold</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">Points</th>
                    <th className="px-3 py-3 text-right">TCV</th>
                    <th className="px-5 py-3">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const rep = r.reps as unknown as { first_name: string; last_name: string };
                    return (
                      <tr key={r.id} className="border-b border-[#EEEFF1] last:border-0 hover:bg-[#FAFAFB]">
                        <td className="px-5 py-3 font-bold"><Link href={`/cards/${r.id}`} className="!text-[#111214] hover:!text-[#C8173F]">{r.business_name}</Link></td>
                        <td className="px-3 py-3">{rep.first_name} {rep.last_name}</td>
                        {dealerships.size > 1 && <td className="px-3 py-3 text-[#5B5F66]">{(r.dealerships as unknown as { name: string }).name}</td>}
                        <td className="px-3 py-3 tabular-nums text-[#5B5F66]">{new Date(`${r.sale_date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</td>
                        <td className="px-3 py-3">
                          <span className="flex flex-wrap gap-1.5">
                            <Pill tone={r.customer_type === "new_logo" ? "dark" : r.customer_type === "residential" ? "outline" : "light"}>{TYPE_LABELS[r.customer_type as CustomerType]}</Pill>
                            {r.addendum && <Pill tone="outline">Addendum</Pill>}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {r.points > 0 ? <Pill tone="crimson">{r.points} {r.points === 1 ? "pt" : "pts"}</Pill> : <Pill tone="light">No points</Pill>}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(Number(r.tcv))}</td>
                        <td className="px-5 py-3">
                          <span className="flex flex-wrap gap-1.5">
                            {!r.submitted && <Pill tone="outline">Draft</Pill>}
                            {r.is_late_entry && <Pill tone="crimson">Late entry</Pill>}
                            {r.term_months < 12 && <Pill tone="amber">Under 12 months</Pill>}
                            {similar.has(r.id) && <Pill tone="amber">Similar name</Pill>}
                            {r.customer_type === "new_logo" && !r.addendum && !r.is_new_logo && r.term_months >= 12 && <Pill tone="amber">Not counted as new logo</Pill>}
                            {needsUpload(r.customer_type as CustomerType, Number(r.tcv)) && r.tally_card_files.length === 0 && <Pill tone="amber">Needs PDF</Pill>}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
