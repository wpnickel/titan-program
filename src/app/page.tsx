import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CategoryCard, NameList } from "@/components/boards";
import { Pill, ui } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES, monthLabel, ordered, repName, type BoardRow, type CronusRow } from "@/lib/boards";

export const instant = false;

const NY = "America/New_York";

export default async function Home() {
  const profile = await requireUser();
  const supabase = await createClient();

  const [{ data: monthRows }, { data: reps }, { data: latest }, { data: secAccess }] = await Promise.all([
    supabase.from("months").select("month_start, status").order("month_start", { ascending: true }),
    supabase.rpc("enterable_reps"),
    supabase.rpc("latest_finalized_month"),
    supabase.rpc("securitas_access"),
  ]);
  const months = (monthRows ?? []) as { month_start: string; status: "open" | "in_audit" | "finalized" }[];
  const open = months.filter((m) => m.status === "open");
  const inAudit = months.find((m) => m.status === "in_audit");
  const canEnter = ((reps ?? []) as unknown[]).length > 0;

  // The audit for the earliest open month starts on the 11th of the next month.
  let auditNote = "";
  const first = open[0];
  if (first) {
    const [y, m] = first.month_start.split("-").map(Number) as [number, number];
    const start = new Date(Date.UTC(y, m, 11));
    const todayNY = new Date(new Date().toLocaleDateString("en-CA", { timeZone: NY }) + "T00:00:00Z");
    if (todayNY < start) {
      auditNote = `${monthLabel(first.month_start, false)} audit starts ${start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
    }
  }
  if (!auditNote && inAudit) auditNote = `${monthLabel(inAudit.month_start, false)} is being audited`;

  const finalized = (latest as unknown as string | null) ?? null;
  let monthly: BoardRow[] = [], ytd: BoardRow[] = [], cronus: CronusRow[] = [], secMonthly: BoardRow[] = [], secYtd: BoardRow[] = [];
  const showSecuritas = secAccess === true;
  if (finalized) {
    const [a, b, c, d, e] = await Promise.all([
      supabase.rpc("board", { p_kind: "month", p_month: finalized }),
      supabase.rpc("board", { p_kind: "ytd", p_month: finalized }),
      supabase.rpc("cronus_trip", { p_month: finalized }),
      showSecuritas ? supabase.rpc("securitas_board", { p_kind: "month", p_month: finalized }) : Promise.resolve({ data: [] }),
      showSecuritas ? supabase.rpc("securitas_board", { p_kind: "ytd", p_month: finalized }) : Promise.resolve({ data: [] }),
    ]);
    monthly = (a.data ?? []) as BoardRow[];
    ytd = (b.data ?? []) as BoardRow[];
    cronus = (c.data ?? []) as CronusRow[];
    secMonthly = (d.data ?? []) as BoardRow[];
    secYtd = (e.data ?? []) as BoardRow[];
  }
  const mine = profile.rep_id;

  return (
    <AppShell profile={profile}>
      <main className="mx-auto flex max-w-[1296px] flex-col gap-7 px-4 py-8 sm:px-8">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex min-w-0 flex-[1_1_420px] flex-wrap items-center gap-3 rounded-[14px] bg-[#111214] px-[18px] py-3.5 text-[15px] font-semibold text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
            <span>
              {open.length === 0 ? "No month is open for entry right now"
                : `${open.map((m) => monthLabel(m.month_start, false)).join(" & ")} tally ${open.length === 1 ? "cards" : "cards"} can be entered`}
            </span>
            {auditNote && <span className="ml-auto text-[13px] font-medium text-[#C9CBD0]">{auditNote}</span>}
          </div>
          {canEnter && <Link href="/cards/new" className="inline-flex items-center gap-2 rounded-[14px] bg-[#C8173F] px-[22px] py-3.5 text-[15px] font-bold !text-white hover:bg-[#9E1031]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
            New tally card
          </Link>}
        </div>

        {finalized ? (
          <>
            <div className="flex flex-wrap items-baseline gap-3.5">
              <h1 className="text-[30px] font-extrabold tracking-tight">{monthLabel(finalized, false)} leaderboards</h1>
              <Pill tone="outline">Audit finalized</Pill>
            </div>
            <section className="grid grid-cols-1 gap-5 md:grid-cols-2 min-[1700px]:grid-cols-4">
              {CATEGORIES.map((c) => <CategoryCard key={c.key} cat={c} rows={monthly} month={finalized} mine={mine} />)}
            </section>
            <section className="flex flex-wrap gap-5">
              <NameList title="Supreme Titan" href={`/leaderboards?board=supreme&month=${finalized}`} mine={mine}
                sub={`Year to date, January through ${monthLabel(finalized, false)} (audited months only)`}
                empty="No one is ranked in all four categories yet."
                items={ordered(ytd, (r) => r.overall_rank).filter((r) => r.overall_rank! <= 10).slice(0, 10).map((r) => ({ key: r.rep_id, rank: r.overall_rank, name: repName(r), rep_id: r.rep_id }))} />
              <NameList title="Cronus Trip" href={`/leaderboards?board=cronus&month=${finalized}`} mine={mine}
                sub="Trip qualifiers from the year-to-date rankings"
                empty="No qualifiers yet."
                items={cronus.map((r) => ({ key: r.rep_id, rank: r.slot, name: repName(r), note: r.reason, rep_id: r.rep_id }))} />
            </section>

            {showSecuritas && (
              <>
                <div className="mt-2 flex flex-wrap items-baseline gap-3.5">
                  <h2 className="text-[26px] font-extrabold tracking-tight">Securitas leaderboards</h2>
                  <Pill tone="dark">Securitas only</Pill>
                  <span className="text-[13px] text-[#5B5F66]">{monthLabel(finalized, false)}, ranked among Securitas salespeople</span>
                </div>
                <section className="grid grid-cols-1 gap-5 md:grid-cols-2 min-[1700px]:grid-cols-4">
                  {CATEGORIES.map((c) => <CategoryCard key={c.key} cat={c} rows={secMonthly} month={finalized} mine={mine} scope="securitas" />)}
                </section>
                <section className="flex flex-wrap gap-5">
                  <NameList title="Securitas Supreme Titan" href={`/leaderboards?board=supreme&month=${finalized}&scope=securitas`} mine={mine}
                    sub={`Year to date, January through ${monthLabel(finalized, false)} (audited months only)`}
                    empty="No one is ranked in all four categories yet."
                    items={ordered(secYtd, (r) => r.overall_rank).slice(0, 10).map((r) => ({ key: r.rep_id, rank: r.overall_rank, name: repName(r), rep_id: r.rep_id }))} />
                </section>
              </>
            )}
          </>
        ) : (
          <section className={`${ui.card} p-6`}>
            <h1 className="text-2xl font-extrabold">Leaderboards</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#5B5F66]">
              The boards appear here once the first month has been audited and finalized. Nothing on this page is preliminary.
            </p>
          </section>
        )}
      </main>
    </AppShell>
  );
}
