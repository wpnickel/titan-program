"use client";

import { useState, useTransition } from "react";
import { ui } from "@/components/ui";
import { DEFAULT_ORDER, TIEBREAK_LABELS } from "./order";
import { saveTiebreakOrder } from "./actions";

/** Four categories in tie-breaker order, with up and down buttons. */
export function TiebreakForm({ initial }: { initial: string[] }) {
  const [order, setOrder] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const changed = order.join() !== saved.join();

  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j > 3) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setOrder(next); setMsg(null);
  }
  function save() {
    start(async () => {
      const r = await saveTiebreakOrder(order);
      if (r.error) setMsg({ kind: "error", text: r.error });
      else { setSaved(order); setMsg({ kind: "ok", text: r.notice ?? "Saved." }); }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-2" aria-label="Tie-breaker order">
        {order.map((k, i) => (
          <li key={k} className="flex items-center gap-3 rounded-[14px] border border-[#E6E7EA] bg-white px-4 py-3">
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${i === 0 ? "bg-[#C8173F] text-white" : "bg-[#F0F0F2] text-[#3A3D42]"}`}>{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold">{TIEBREAK_LABELS[k]!.label}</span>
              <span className="block text-[13px] text-[#5B5F66]">{TIEBREAK_LABELS[k]!.note}</span>
            </span>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || pending} aria-label={`Move ${TIEBREAK_LABELS[k]!.label} up`}
              className="flex size-9 cursor-pointer items-center justify-center rounded-[10px] border border-[#CFD1D6] bg-white hover:border-[#111214] disabled:cursor-default disabled:opacity-30 disabled:hover:border-[#CFD1D6]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111214" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 15l6-6 6 6" /></svg>
            </button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === 3 || pending} aria-label={`Move ${TIEBREAK_LABELS[k]!.label} down`}
              className="flex size-9 cursor-pointer items-center justify-center rounded-[10px] border border-[#CFD1D6] bg-white hover:border-[#111214] disabled:cursor-default disabled:opacity-30 disabled:hover:border-[#CFD1D6]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111214" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
            </button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={!changed || pending} className={ui.primary}>{pending ? "Saving…" : "Save order"}</button>
        <button type="button" onClick={() => { setOrder(DEFAULT_ORDER); setMsg(null); }} disabled={pending || order.join() === DEFAULT_ORDER.join()} className={`${ui.secondary} disabled:opacity-40`}>Reset to the original order</button>
        {msg && <p role={msg.kind === "error" ? "alert" : "status"} className={`text-sm font-semibold ${msg.kind === "error" ? "text-[#C8173F]" : "text-[#1F7A3D]"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
