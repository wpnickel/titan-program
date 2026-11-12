"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** A modal like the ones in the Popups mockup: warning icon, title, text, and two buttons. */
export function WarningDialog({
  open, title, children, secondary, primary, onSecondary, onPrimary, tone = "warning",
}: {
  open: boolean; title: string; children: ReactNode;
  secondary: string; primary: string; onSecondary: () => void; onPrimary: () => void;
  /** "success" swaps the amber exclamation for a green check. */
  tone?: "warning" | "success";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby="warning-title"
      onCancel={(e) => { e.preventDefault(); onSecondary(); }}
      className="m-auto w-[min(560px,calc(100vw-32px))] rounded-[22px] bg-white p-7 text-[#111214] shadow-[0_18px_40px_rgba(17,18,20,0.16)] backdrop:bg-[#111214]/50"
    >
      <div className="flex items-start gap-4">
        {tone === "success" ? (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#D8F2E0]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14612F" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
        ) : (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#FFE9B8]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7A4B00" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M12 6v8M12 18.5v.5" /></svg>
          </span>
        )}
        <div>
          <h2 id="warning-title" className="text-xl font-extrabold">{title}</h2>
          <div className="mt-1.5 text-[15px] leading-relaxed text-[#3A3D42]">{children}</div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2.5">
        <button type="button" onClick={onSecondary} className="h-[46px] cursor-pointer rounded-xl border border-[#111214] bg-white px-5 text-[15px] font-bold hover:bg-[#F5F5F6]">{secondary}</button>
        <button type="button" onClick={onPrimary} autoFocus className="h-[46px] cursor-pointer rounded-xl bg-[#C8173F] px-[22px] text-[15px] font-extrabold text-white hover:bg-[#9E1031]">{primary}</button>
      </div>
    </dialog>
  );
}
