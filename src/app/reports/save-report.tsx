"use client";

import { useSearchParams } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { ui } from "@/components/ui";
import { saveReport } from "./actions";

/** "Save report": a small popover that names the current filters and columns. */
export function SaveReport() {
  const params = useSearchParams();
  const query = (() => { const p = new URLSearchParams(params.toString()); p.delete("page"); return p.toString(); })();
  return (
    <details className="relative">
      <summary className={`${ui.secondary} !h-[42px] list-none !text-sm [&::-webkit-details-marker]:hidden`}>Save report</summary>
      <div className="absolute right-0 z-20 mt-2 w-[300px] rounded-[14px] border border-[#E6E7EA] bg-white p-4 shadow-[0_12px_30px_rgba(17,18,20,0.14)]">
        <ActionForm action={saveReport} className="flex flex-col gap-3">
          <input type="hidden" name="query" value={query} />
          <label>
            <span className={ui.label}>Name</span>
            <input name="name" maxLength={80} required placeholder="Sales with a Warranty" className={ui.input} />
          </label>
          <p className="text-xs leading-snug text-[#5B5F66]">Saves the filters and columns you have chosen. Saving with a name you already use replaces it.</p>
          <button className={ui.primary}>Save</button>
        </ActionForm>
      </div>
    </details>
  );
}
