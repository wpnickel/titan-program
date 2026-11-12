import Link from "next/link";
import { repName, type BoardRow, type Category, ordered } from "@/lib/boards";

/** The round rank badge: crimson for 1st, black for 2nd, grey for 3rd, light for the rest. */
export function RankChip({ rank, size = 30 }: { rank: number | null; size?: number }) {
  const tone = rank === 1 ? "bg-[#C8173F] text-white" : rank === 2 ? "bg-[#111214] text-white" : rank === 3 ? "bg-[#DADCE0] text-[#111214]" : "bg-[#F0F0F2] text-[#3A3D42]";
  return (
    <span style={{ width: size, height: size }} className={`flex shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ${tone}`}>
      {rank ?? "–"}
    </span>
  );
}

/** A category board on the landing page: the top 3 and a link to every rep. */
export function CategoryCard({ cat, rows, month, mine, scope }: { cat: Category; rows: BoardRow[]; month: string; mine: string | null; scope?: string }) {
  const top = ordered(rows, cat.rank).slice(0, 3);
  return (
    <article className="flex min-w-0 flex-col gap-3.5 rounded-[18px] border border-[#E6E7EA] bg-white p-[22px]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-bold tracking-[0.08em] text-[#C8173F]">{cat.tag}</div>
          <h2 className="mt-0.5 text-xl font-extrabold">{cat.title}</h2>
        </div>
        <Link href={`/leaderboards?board=${cat.key}&month=${month}${scope ? `&scope=${scope}` : ""}`} className="whitespace-nowrap text-[13px] font-semibold !text-[#C8173F] hover:underline">Full results →</Link>
      </div>
      {top.length === 0 ? (
        <p className="border-t border-[#EEEFF1] pt-3 text-sm text-[#5B5F66]">No one is ranked here yet.</p>
      ) : (
        <ol className="flex flex-col">
          {top.map((r) => (
            <li key={r.rep_id} className={`flex items-center gap-3 border-t border-[#EEEFF1] py-3 ${r.rep_id === mine ? "-mx-2 rounded-lg bg-[#FBE7EC]/60 px-2" : ""}`}>
              <RankChip rank={cat.rank(r)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold">{repName(r)}</span>
                <span className="block truncate text-xs text-[#5B5F66]">{r.dealership}</span>
              </span>
              <span className="text-base font-extrabold tabular-nums">{cat.fmt(cat.value(r))}</span>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

/** A ten-name list (Supreme Titan, Cronus Trip). */
export function NameList({ title, sub, href, items, mine, empty }: {
  title: string; sub: string; href: string; items: { key: string; rank: number | null; name: string; note?: string; rep_id: string }[]; mine: string | null; empty: string;
}) {
  return (
    <article className="min-w-0 flex-[1_1_520px] rounded-[18px] border border-[#E6E7EA] bg-white p-[22px]">
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold">{title}</h2>
          <div className="mt-0.5 text-[13px] text-[#5B5F66]">{sub}</div>
        </div>
        <Link href={href} className="whitespace-nowrap text-[13px] font-semibold !text-[#C8173F] hover:underline">Full results →</Link>
      </div>
      {items.length === 0 ? (
        <p className="border-t border-[#EEEFF1] pt-3 text-sm text-[#5B5F66]">{empty}</p>
      ) : (
        <ol className="flex flex-wrap gap-x-8">
          {items.map((i) => (
            <li key={i.key} className={`flex min-w-[220px] flex-[1_1_220px] items-center gap-3 border-t border-[#EEEFF1] py-2.5 ${i.rep_id === mine ? "rounded-lg bg-[#FBE7EC]/60 px-2" : ""}`}>
              <RankChip rank={i.rank} size={28} />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold">{i.name}</span>
                {i.note && <span className="block truncate text-xs text-[#5B5F66]">{i.note}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
