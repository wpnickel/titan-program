"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useAudit } from "./audit-context";
import { BASE_FILTERS, REASONS, SORTS, STATUS_LABEL, matchesFilter, type SortKey } from "./audit-types";

const DOT = {
  unreviewed: "border-[#8E929A] bg-white",
  on_hold: "border-[#C8173F] bg-[#C8173F]",
  approved: "border-[#1F7A3D] bg-[#1F7A3D]",
  adjusted: "border-[#B97A00] bg-[#B97A00]",
} as const;

const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Every card in the month: search, sort, filter chips, and one compact row per card. */
export function AuditList({ monthName }: { monthName: string }) {
  const { rows, visible, selectedId, query, setQuery, sort, setSort, filter, setFilter, hrefFor } = useAudit();
  const selectedRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => { selectedRef.current?.scrollIntoView({ block: "nearest" }); }, [selectedId]);

  const reasonChips = Object.entries(REASONS).map(([value, v]) => ({ value, label: v.filter }));
  const chips = [...BASE_FILTERS, ...reasonChips]
    .map((c) => ({ ...c, count: rows.filter((r) => matchesFilter(r, c.value)).length }))
    .filter((c) => c.value === "all" || c.value === filter || c.count > 0);

  return (
    <aside aria-label={`Cards to audit in ${monthName}`} className="flex max-h-[70vh] min-h-0 flex-col rounded-[18px] border border-[#E6E7EA] bg-white lg:max-h-none lg:w-[300px] lg:flex-none 2xl:w-[340px]">
      <div className="flex flex-col gap-2.5 border-b border-[#E6E7EA] p-3.5">
        <div className="flex gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Search cards</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cards"
              className="h-[38px] w-full rounded-[10px] border border-[#CFD1D6] bg-white px-3 text-[13px] font-medium outline-none placeholder:text-[#8E929A] focus:border-[#C8173F] focus:ring-4 focus:ring-[#C8173F]/10" />
          </label>
          <label>
            <span className="sr-only">Sort by</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-[38px] rounded-[10px] border border-[#CFD1D6] bg-white px-2 text-xs font-semibold text-[#3A3D42]">
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button key={c.value} type="button" onClick={() => setFilter(c.value)} aria-pressed={filter === c.value}
              className={`inline-flex h-7 cursor-pointer items-center rounded-full border px-3 text-xs font-semibold ${filter === c.value ? "border-[#111214] bg-[#111214] text-white" : c.value === "waiting" ? "border-[#C8173F] bg-white text-[#9E1031] hover:bg-[#FBE7EC]" : "border-[#CFD1D6] bg-white text-[#3A3D42] hover:border-[#111214]"}`}>
              {c.label} {c.count}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="p-8 text-center text-sm text-[#5B5F66]">{rows.length === 0 ? `No submitted cards in ${monthName} yet.` : "No cards match."}</p>
      ) : (
        <ul className="m-0 flex min-h-0 flex-1 list-none flex-col gap-0.5 overflow-y-auto p-1.5">
          {visible.map((q) => {
            const on = q.card_id === selectedId;
            return (
              <li key={q.card_id}>
                <Link ref={on ? selectedRef : undefined} href={hrefFor(q.card_id)} aria-current={on ? "true" : undefined}
                  className={`flex items-start gap-2.5 rounded-[10px] border px-2.5 py-2 !text-[#111214] ${on ? "border-[#111214] bg-[#F5F5F6]" : "border-transparent hover:bg-[#FAFAFB]"}`}>
                  <span aria-hidden="true" className={`mt-[5px] size-2.5 shrink-0 rounded-full border-2 ${DOT[q.audit_status]}`} />
                  <span className="sr-only">{STATUS_LABEL[q.audit_status]}.</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="flex justify-between gap-2 text-[13.5px] font-bold"><span className="truncate">{q.business_name}</span><span className="shrink-0 text-[#3A3D42]">{q.points} pts</span></span>
                    <span className="flex justify-between gap-2 text-xs text-[#5B5F66]"><span className="truncate">{q.rep_name} · {q.dealership}</span><span className="shrink-0">{shortDate(q.sale_date)}</span></span>
                    {q.reasons.length > 0 && (
                      <span className="flex flex-wrap gap-1">
                        {q.reasons.map((r) => <span key={r} className="rounded-md bg-[#F0F0F2] px-1.5 py-0.5 text-[10.5px] font-bold text-[#3A3D42]">{REASONS[r]?.tag ?? r}</span>)}
                      </span>
                    )}
                    {q.notes && <span className="truncate text-[11.5px] italic text-[#9E1031]">“{q.notes}”</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-[#E6E7EA] px-3.5 py-2.5 text-xs text-[#5B5F66]">
        {visible.length === rows.length ? `${rows.length} ${rows.length === 1 ? "card" : "cards"}` : `${visible.length} of ${rows.length} cards`}
      </div>
    </aside>
  );
}
