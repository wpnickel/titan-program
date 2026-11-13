"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { WarningDialog } from "@/components/dialog";
import { cancelAudit, finalizeMonth, reopenMonth, startAudit } from "./actions";

type Kind = "start" | "finalize" | "reopen" | "cancel";

/** The audit button and its confirmations. Each one acts on every dealership at once. */
export function MonthControls({ month, name, kind, unreviewed }: { month: string; name: string; kind: Kind; unreviewed: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const label = kind === "start" ? `Start ${name} audit` : kind === "finalize" ? `Finalize ${name}` : kind === "cancel" ? "Return to open" : "Reopen for audit";
  const btn = kind === "cancel"
    ? "h-10 cursor-pointer rounded-[10px] border border-[#CFD1D6] bg-white px-4 text-[13px] font-bold text-[#3A3D42] hover:bg-[#F5F5F6]"
    : kind === "reopen"
    ? "h-10 cursor-pointer rounded-[10px] border border-[#111214] bg-white px-4 text-[13px] font-bold hover:bg-[#F5F5F6]"
    : kind === "start"
      ? "h-10 cursor-pointer rounded-[10px] bg-[#111214] px-4 text-[13px] font-extrabold text-white hover:bg-[#2A2C31]"
      : "h-10 cursor-pointer rounded-[10px] bg-[#111214] px-[18px] text-[13px] font-extrabold text-white hover:bg-[#2A2C31]";

  function confirm() {
    if ((kind === "reopen" || kind === "cancel") && !reason.trim()) { setError(kind === "cancel" ? "Enter a reason for returning the month to open." : "Enter a reason for reopening."); return; }
    start(async () => {
      const r = kind === "start" ? await startAudit(month) : kind === "finalize" ? await finalizeMonth(month) : kind === "cancel" ? await cancelAudit(month, reason) : await reopenMonth(month, reason);
      if (r.error) { setError(r.error); return; }
      setOpen(false); setError(null); setReason("");
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={() => { setError(null); setOpen(true); }} className={btn}>{label}</button>
      <WarningDialog open={open} title={label + "?"} secondary="Cancel" primary={pending ? "Working…" : label}
        onSecondary={() => setOpen(false)} onPrimary={confirm}>
        {kind === "start" && <>This locks {name} for every dealership. Only you can edit its cards after that, and the next month opens for entry.</>}
        {kind === "finalize" && (
          <>
            This locks {name} for everyone, including you, and freezes its points and new logos so it counts toward the year-to-date boards.
            {unreviewed > 0 && <b className="mt-2 block text-[#9E1031]">{unreviewed} {unreviewed === 1 ? "card has" : "cards have"} not been approved yet.</b>}
          </>
        )}
        {(kind === "reopen" || kind === "cancel") && (
          <>
            {kind === "reopen"
              ? <>Reopening puts {name} back in audit so you can edit it. The reason is saved to the audit log.</>
              : <>This unlocks {name} so dealerships can enter and edit cards again. Reviews and adjustments you made are kept. The month that opened when you started the audit stays open. The reason is saved to the audit log.</>}
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" aria-label={kind === "reopen" ? "Reason for reopening" : "Reason for returning to open"}
              className="mt-3 h-11 w-full rounded-[10px] border border-[#CFD1D6] px-3 text-sm font-medium outline-none focus:border-[#C8173F]" />
          </>
        )}
        {error && <b role="alert" className="mt-2 block text-[#9E1031]">{error}</b>}
      </WarningDialog>
    </>
  );
}
