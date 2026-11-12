import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { RankChip } from "@/components/boards";
import { Pill, ui } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES, monthLabel, ordered, repName, type BoardRow, type CronusRow } from "@/lib/boards";

export const instant = false;

const TABS = [
  ...CATEGORIES.map((c) => ({ key: c.key as string, label: c.title, group: "month" })),
  { key: "overall", label: "Overall", group: "month" },
  { key: "supreme", label: "Supreme Titan", group: "ytd" },
  { key: "cronus", label: "Cronus Trip", group: "ytd" },
];

export default async function LeaderboardsPage({ searchParams }: { searchParams: Promise<{ board?: string; month?: string; scope?: string }> }) {
  const profile = await requireUser();
  const sp = await searchParams;
  const supabase = await createClient();
  const isAdmin = profile.preset === "super_admin";

  const { data: monthRows } = await supabase.from("months").select("month_start, status").order("month_start", { ascending: false }).limit(36);
  // Everyone sees finalized months. The super admin can also preview a month that is still open or in audit.
  const months = ((monthRows ?? []) as { month_start: string; status: string }[]).filter((m) => m.status === "finalized" || isAdmin);
  const month = months.find((m) => m.month_start === sp.month) ?? months.find((m) => m.status === "finalized") ?? months[0];
  const { data: secAccess } = await supabase.rpc("securitas_access");
  const securitas = sp.scope === "securitas" && secAccess === true;
  const tabs = securitas ? TABS.filter((t) => t.key !== "cronus") : TABS;
  const tab = tabs.find((t) => t.key === sp.board) ?? tabs[0]!;
  const preview = month && month.status !== "finalized";

  let rows: BoardRow[] = [], cronus: CronusRow[] = [];
  if (month) {
    if (tab.key === "cronus") {
      const { data } = await supabase.rpc("cronus_trip", { p_month: month.month_start });
      cronus = (data ?? []) as CronusRow[];
    } else {
      const { data } = await supabase.rpc(securitas ? "securitas_board" : "board", { p_kind: tab.group === "ytd" ? "ytd" : "month", p_month: month.month_start });
      rows = (data ?? []) as BoardRow[];
    }
  }
  const mine = profile.rep_id;
  const cat = CATEGORIES.find((c) => c.key === tab.key);
  const href = (board: string, m = month?.month_start, scope = securitas ? "securitas" : "") => `/leaderboards?board=${board}${m ? `&month=${m}` : ""}${scope ? `&scope=${scope}` : ""}`;

  const title = tab.key === "supreme" ? "Supreme Titan" : tab.key === "cronus" ? "Cronus Trip" : tab.key === "overall" ? "Overall" : cat!.title;
  const sub = !month ? "" : tab.group === "ytd"
    ? `Year to date, January through ${monthLabel(month.month_start)}`
    : `${monthLabel(month.month_start)}${tab.key === "overall" ? ": the four ranks added, lowest total leads" : ""}`;

  return (
    <AppShell profile={profile}>
      <main className="mx-auto flex max-w-[1296px] flex-col gap-6 px-4 py-8 sm:px-8">
        <div className="flex flex-wrap items-baseline gap-3.5">
          <h1 className="text-[30px] font-extrabold tracking-tight">{securitas ? "Securitas leaderboards" : "Leaderboards"}</h1>
          {securitas && <Pill tone="dark">Securitas only</Pill>}
          {preview && <Pill tone="amber">Preview: this month is not finalized</Pill>}
          <div className="flex-1" />
          <Link href="/" className="text-sm font-semibold !text-[#C8173F] hover:underline">← Home</Link>
        </div>

        {secAccess === true && (
          <nav aria-label="Leaderboard group" className="flex gap-1.5">
            {[{ key: "", label: "Company" }, { key: "securitas", label: "Securitas" }].map((g) => (
              <Link key={g.key} href={href(tab.key === "cronus" && g.key ? "rmr" : tab.key, month?.month_start, g.key)}
                className={`rounded-lg px-3.5 py-1.5 text-[13px] font-bold ${(securitas ? "securitas" : "") === g.key ? "bg-[#C8173F] !text-white" : "border border-[#CFD1D6] bg-white !text-[#3A3D42] hover:border-[#111214]"}`}>
                {g.label}
              </Link>
            ))}
          </nav>
        )}

        <nav aria-label="Board" className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <Link key={t.key} href={href(t.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${t.key === tab.key ? "bg-[#111214] !text-white" : "border border-[#CFD1D6] bg-white !text-[#3A3D42] hover:border-[#111214]"}`}>
              {t.label}
            </Link>
          ))}
        </nav>

        {months.length > 0 ? (
          <nav aria-label="Month" className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[13px] font-semibold text-[#5B5F66]">{tab.group === "ytd" ? "Through" : "Month"}</span>
            {months.map((m) => (
              <Link key={m.month_start} href={href(tab.key, m.month_start)}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${m.month_start === month?.month_start ? "bg-[#C8173F] !text-white" : "border border-[#CFD1D6] bg-white !text-[#3A3D42] hover:border-[#111214]"}`}>
                {monthLabel(m.month_start)}
              </Link>
            ))}
          </nav>
        ) : (
          <section className={`${ui.card} p-6`}>
            <p className="text-sm text-[#5B5F66]">There is nothing to show yet. Boards appear once the first month has been finalized.</p>
          </section>
        )}

        {month && (
          <section className={`${ui.card} overflow-hidden`}>
            <div className="flex flex-wrap items-baseline gap-3 px-6 pt-5">
              <h2 className="text-xl font-extrabold">{title}</h2>
              <span className="text-[13px] text-[#5B5F66]">{sub}</span>
            </div>
            <div className="overflow-x-auto px-2 pb-3 pt-2 sm:px-4">
              {tab.key === "cronus" ? (
                <Table head={["", "Rep", "Dealership", "Spot"]} widths={["w-14", "", "", ""]}>
                  {cronus.map((r) => (
                    <Row key={r.rep_id} mine={r.rep_id === mine}
                      cells={[<RankChip key="r" rank={r.slot} size={28} />, <Name key="n" r={r} mine={r.rep_id === mine} />, r.dealership, r.reason]} />
                  ))}
                </Table>
              ) : cat ? (
                <Table head={["", "Rep", "Dealership", cat.title]} widths={["w-14", "", "", "text-right"]}>
                  {ordered(rows, cat.rank, true).map((r) => (
                    <Row key={r.rep_id} mine={r.rep_id === mine} muted={cat.rank(r) === null}
                      cells={[<RankChip key="r" rank={cat.rank(r)} size={28} />, <Name key="n" r={r} mine={r.rep_id === mine} />, r.dealership,
                        <span key="v" className="font-extrabold tabular-nums">{cat.fmt(cat.value(r))}</span>]} align={[0, 0, 0, 1]} />
                  ))}
                </Table>
              ) : (
                <Table head={["", "Rep", "Dealership", "Score", "RMR", "Install", "New logos", "Points"]} widths={["w-14", "", "", "text-right", "text-right", "text-right", "text-right", "text-right"]}>
                  {ordered(rows, (r) => r.overall_rank, true).map((r) => (
                    <Row key={r.rep_id} mine={r.rep_id === mine} muted={r.overall_rank === null} align={[0, 0, 0, 1, 1, 1, 1, 1]}
                      cells={[<RankChip key="r" rank={r.overall_rank} size={28} />, <Name key="n" r={r} mine={r.rep_id === mine} />, r.dealership,
                        <span key="s" className="font-extrabold tabular-nums">{r.score ?? "–"}</span>,
                        r.rmr_rank ?? "–", r.install_rank ?? "–", r.new_logo_rank ?? "–", r.points_rank ?? "–"]} />
                  ))}
                </Table>
              )}
            </div>
            <p className="border-t border-[#EEEFF1] px-6 py-3 text-xs leading-relaxed text-[#5B5F66]">
              {tab.key === "cronus"
                ? "Ten spots from the year-to-date rankings: the Supreme Titan leader, the top 2 in each category, then the best Securitas rep. Anyone already picked is skipped."
                : "A rep with nothing in a category has no rank there. Ties are broken in the program's tie-breaker order, and reps still tied share the rank. Only reps ranked in all four categories are ranked overall."}
            </p>
          </section>
        )}
      </main>
    </AppShell>
  );
}

function Name({ r, mine }: { r: { first_name: string; last_name: string }; mine: boolean }) {
  return <span className="inline-flex items-center gap-2 font-bold">{repName(r)}{mine && <Pill tone="crimson">You</Pill>}</span>;
}

function Table({ head, widths, children }: { head: string[]; widths: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full min-w-[560px] border-collapse text-sm">
      <thead>
        <tr className="text-left text-xs font-bold tracking-wide text-[#5B5F66]">
          {head.map((h, i) => <th key={i} scope="col" className={`px-3 py-2.5 ${widths[i]}`}>{h}</th>)}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function Row({ cells, mine, muted, align }: { cells: React.ReactNode[]; mine: boolean; muted?: boolean; align?: number[] }) {
  return (
    <tr className={`border-t border-[#EEEFF1] ${mine ? "bg-[#FBE7EC]/60" : ""} ${muted ? "text-[#8E929A]" : ""}`}>
      {cells.map((c, i) => <td key={i} className={`px-3 py-2.5 ${align?.[i] ? "text-right" : ""}`}>{c}</td>)}
    </tr>
  );
}
