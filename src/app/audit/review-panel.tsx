"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ui } from "@/components/ui";
import { CUSTOMER_TYPES, type Check, type CustomerType } from "@/lib/cards";
import { adjustCard, approveCard, saveNotes } from "./actions";

type Decision = "true" | "false";

/** The decision controls for one card: is it a new logo, anything else to change, and why. */
export function ReviewPanel({ cardId, nextHref, locked, status, savedNotes, current }: {
  cardId: string; nextHref: string; locked: boolean;
  status: "unreviewed" | "approved" | "adjusted" | "on_hold"; savedNotes: string;
  current: { newLogo: boolean; customerType: CustomerType; points: number; overridden: boolean };
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<Decision>(current.newLogo ? "true" : "false");
  const [type, setType] = useState<CustomerType>(current.customerType);
  const [points, setPoints] = useState(String(current.points));
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState(savedNotes);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const changed = {
    newLogo: (decision === "true") !== current.newLogo,
    type: type !== current.customerType,
    points: points.trim() !== "" && Number(points) !== current.points,
  };
  const dirty = changed.newLogo || changed.type || changed.points;

  async function save(): Promise<boolean> {
    if (!dirty) return true;
    if (!reason.trim()) { setMessage({ kind: "error", text: "Enter a reason for the change. It is saved to the audit log." }); return false; }
    if (changed.points && !/^\d+$/.test(points.trim())) { setMessage({ kind: "error", text: "Points must be a whole number." }); return false; }
    const r = await adjustCard({
      cardId, reason,
      ...(changed.newLogo ? { newLogo: decision } : {}),
      ...(changed.type ? { customerType: type } : {}),
      ...(changed.points ? { points: Number(points) } : {}),
    });
    if (r.error) { setMessage({ kind: "error", text: r.error }); return false; }
    return true;
  }

  const onSave = () => start(async () => {
    setMessage(null);
    if (!dirty) { setMessage({ kind: "error", text: "Nothing has changed yet." }); return; }
    if (await save()) { setReason(""); setMessage({ kind: "ok", text: "Adjustment saved." }); router.refresh(); }
  });
  const notesChanged = notes.trim() !== savedNotes.trim();
  const reviewed = status === "approved" || status === "adjusted";
  const onNotes = (hold: boolean) => start(async () => {
    setMessage(null);
    if (hold && !notes.trim()) { setMessage({ kind: "error", text: "Enter a note about what you are waiting for." }); return; }
    const r = await saveNotes(cardId, notes, hold);
    if (r.error) { setMessage({ kind: "error", text: r.error }); return; }
    setMessage({ kind: "ok", text: hold ? "Saved. This card is waiting for information and is not approved." : !notes.trim() && status === "on_hold" ? "Hold released." : "Note saved." });
    router.refresh();
  });
  const onApprove = () => start(async () => {
    setMessage(null);
    if (!(await save())) return;
    if (notesChanged) {
      const n = await saveNotes(cardId, notes, false);
      if (n.error) { setMessage({ kind: "error", text: n.error }); return; }
    }
    const r = await approveCard(cardId, nextHref);
    if (r?.error) setMessage({ kind: "error", text: r.error });
  });
  const onAuto = () => start(async () => {
    setMessage(null);
    if (!reason.trim()) { setMessage({ kind: "error", text: "Enter a reason for the change. It is saved to the audit log." }); return; }
    const r = await adjustCard({ cardId, reason, newLogo: "auto", points: "auto" });
    if (r.error) setMessage({ kind: "error", text: r.error }); else { setReason(""); setMessage({ kind: "ok", text: "Back to the calculated values." }); router.refresh(); }
  });

  return (
    <fieldset disabled={locked || pending} className="m-0 flex min-w-0 flex-col gap-3.5 border-0 p-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[15px] font-extrabold">Counts as a new logo?</div>
        <div role="group" aria-label="New logo decision" className="flex gap-1.5 rounded-xl bg-[#F0F0F2] p-1">
          {([["false", "Not a new logo"], ["true", "New logo"]] as const).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={decision === v} onClick={() => setDecision(v)}
              className={`h-[38px] cursor-pointer rounded-[9px] px-[18px] text-sm font-semibold transition ${decision === v ? "bg-[#111214] text-white" : "text-[#3A3D42] hover:bg-white/70"}`}>{label}</button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="min-w-[180px] flex-1">
          <span className={ui.label}>Customer type</span>
          <select value={type} onChange={(e) => setType(e.target.value as CustomerType)} className={ui.input}>
            {CUSTOMER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="min-w-[140px] flex-1">
          <span className={ui.label}>Points on this card</span>
          <input value={points} onChange={(e) => setPoints(e.target.value)} inputMode="numeric" className={ui.input} />
        </label>
      </div>
      <label>
        <span className={ui.label}>Reason for any change (saved to the audit log)</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={ui.input} />
      </label>
      <label>
        <span className={ui.label}>Notes (only you see these)</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} rows={3}
          placeholder="What you checked, who you contacted, or what you are waiting for"
          className="min-h-[84px] w-full resize-y rounded-[10px] border border-[#CFD1D6] bg-white px-3 py-2.5 text-sm font-medium text-[#111214] placeholder:text-[#8E929A] outline-none transition focus:border-[#C8173F] focus:ring-4 focus:ring-[#C8173F]/10" />
        <span className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] text-[#5B5F66]">
            {status === "on_hold" ? "Waiting for information. This card stays open until you approve or adjust it." : "Saving a note does not approve the card."}
          </span>
          <button type="button" onClick={() => onNotes(!reviewed)} disabled={reviewed ? !notesChanged : !notesChanged && status === "on_hold"}
            className="h-10 cursor-pointer rounded-[10px] border border-[#111214] bg-white px-4 text-sm font-bold hover:bg-[#F5F5F6] disabled:cursor-default disabled:opacity-50">
            {reviewed ? "Save note" : status === "on_hold" && !notes.trim() ? "Release hold" : "Save notes (not approved)"}
          </button>
        </span>
      </label>
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${message.kind === "error" ? "bg-[#FBE7EC] text-[#9E1031]" : "bg-[#E3F4E8] text-[#1F7A3D]"}`}>{message.text}</p>
      )}
      <div className="flex flex-wrap gap-2.5">
        <button type="button" onClick={onApprove} className="h-12 cursor-pointer rounded-xl bg-[#C8173F] px-6 text-[15px] font-extrabold text-white hover:bg-[#9E1031] disabled:opacity-60">
          {pending ? "Working…" : dirty ? "Save and approve" : "Approve and next"}
        </button>
        <button type="button" onClick={onSave} className="h-12 cursor-pointer rounded-xl border border-[#111214] bg-white px-5 text-[15px] font-bold hover:bg-[#F5F5F6]">Save adjustment</button>
        {current.overridden && (
          <button type="button" onClick={onAuto} className="h-12 cursor-pointer rounded-xl border border-[#CFD1D6] bg-white px-5 text-[15px] font-bold text-[#3A3D42] hover:bg-[#F5F5F6]">Use calculated values</button>
        )}
        <Link href={`/cards/${cardId}`} className="inline-flex h-12 items-center rounded-xl border border-[#CFD1D6] bg-white px-5 text-[15px] font-bold !text-[#3A3D42] hover:bg-[#F5F5F6]">Edit full card</Link>
      </div>
      {locked && <p className="text-sm font-semibold text-[#7A4B00]">This month is finalized. Reopen it to make changes.</p>}
    </fieldset>
  );
}

export function RuleChecks({ checks }: { checks: Check[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {checks.map((c) => (
        <li key={c.label} className="flex items-start gap-2.5 text-sm">
          <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${c.ok ? "bg-[#DDF3E6]" : "bg-[#FFE9B8]"}`}>
            {c.ok
              ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0B6B3A" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7" /></svg>
              : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7A4B00" strokeWidth="3.4" strokeLinecap="round" aria-hidden><path d="M12 6v8M12 18v.5" /></svg>}
          </span>
          <span><b>{c.label}</b> <span className="text-[#5B5F66]">· {c.detail}</span></span>
        </li>
      ))}
    </ul>
  );
}
