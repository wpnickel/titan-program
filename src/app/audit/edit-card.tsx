"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAudit } from "./audit-context";

/** Opens the full tally card in a popup on top of the audit page. */
export function EditCardButton() {
  const { openEdit } = useAudit();
  return (
    <button type="button" onClick={openEdit}
      className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-[#111214] bg-white px-3.5 text-[13px] font-bold hover:bg-[#F5F5F6]">
      Edit full card <span className="rounded-md bg-[#F0F0F2] px-1.5 py-0.5 text-[11px] font-bold text-[#3A3D42]">E</span>
    </button>
  );
}

/**
 * The tally card form in a popup. It loads the card only when opened. Closing it returns to the audit page
 * exactly where you were, refreshed if anything was saved.
 */
export function EditCardDialog({ locked }: { locked: boolean }) {
  const router = useRouter();
  const { editing, closeEdit, selectedId } = useAudit();
  const ref = useRef<HTMLDialogElement>(null);
  const saved = useRef(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (editing && !d.open) { saved.current = false; d.showModal(); }
    if (!editing && d.open) d.close();
  }, [editing]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin === window.location.origin && e.data?.type === "titan-card-saved") saved.current = true;
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function close() {
    closeEdit();
    if (saved.current) { saved.current = false; router.refresh(); }
  }

  return (
    <dialog ref={ref} aria-label="Edit tally card" onCancel={(e) => { e.preventDefault(); close(); }}
      className="m-auto h-[min(94vh,1000px)] w-[min(1240px,96vw)] overflow-hidden rounded-[22px] bg-[#F5F5F6] p-0 text-[#111214] shadow-[0_18px_40px_rgba(17,18,20,0.16)] backdrop:bg-[#111214]/50 open:flex open:flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[#E6E7EA] bg-white px-5 py-3">
        <div className="text-[15px] font-extrabold">Edit tally card{locked ? " (this month is finalized)" : ""}</div>
        <button type="button" onClick={close} autoFocus
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-[#111214] bg-white px-4 text-sm font-bold hover:bg-[#F5F5F6]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          Close and return to audit
        </button>
      </div>
      {editing && <iframe key={selectedId} src={`/audit/card/${selectedId}`} title="Tally card" className="min-h-0 w-full flex-1 border-0 bg-[#F5F5F6]" />}
    </dialog>
  );
}
