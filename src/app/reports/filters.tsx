"use client";

import { useRef } from "react";
import { ui } from "@/components/ui";
import { COLUMNS, DEFAULT_COLUMNS } from "@/lib/reports";

type Opt = { value: string; label: string };
export type FilterLists = {
  months: Opt[]; dealerships: Opt[]; reps: Opt[]; products: Opt[]; sources: Opt[]; industries: Opt[]; isAdmin: boolean;
};

const TYPES: Opt[] = [{ value: "existing", label: "Existing" }, { value: "new_logo", label: "New logo" }, { value: "residential", label: "Residential" }];
const YES_NO: Opt[] = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }];
const AUDIT: Opt[] = [{ value: "unreviewed", label: "Unreviewed" }, { value: "approved", label: "Approved" }, { value: "adjusted", label: "Adjusted" }];

function Select({ name, label, options, value, any = "Any" }: { name: string; label: string; options: Opt[]; value: string; any?: string }) {
  return (
    <label className="min-w-0 flex-[1_1_180px]">
      <span className="mb-[5px] block text-xs font-semibold text-[#3A3D42]">{label}</span>
      <select name={name} defaultValue={value} aria-label={label}
        className={`h-[42px] w-full cursor-pointer rounded-[10px] border border-[#CFD1D6] px-3 text-sm font-semibold outline-none focus:border-[#C8173F] ${value ? "bg-[#FBE3E9]" : "bg-white"}`}>
        <option value="">{any}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function Range({ label, lo, hi, p }: { label: string; lo: string; hi: string; p: Record<string, string> }) {
  const active = Boolean(p[lo] || p[hi]);
  return (
    <div className="min-w-0 flex-[1_1_180px]">
      <span className="mb-[5px] block text-xs font-semibold text-[#3A3D42]">{label}</span>
      <div className="flex items-center gap-1.5">
        <input name={lo} defaultValue={p[lo] ?? ""} inputMode="decimal" placeholder="Min" aria-label={`${label} minimum`} className={`${ui.input} !h-[42px] min-w-0 ${active ? "!bg-[#FBE3E9]" : ""}`} />
        <input name={hi} defaultValue={p[hi] ?? ""} inputMode="decimal" placeholder="Max" aria-label={`${label} maximum`} className={`${ui.input} !h-[42px] min-w-0 ${active ? "!bg-[#FBE3E9]" : ""}`} />
      </div>
    </div>
  );
}

/** The filter bar and column picker. It is a plain GET form, so every report is a shareable URL. Dropdowns apply as soon as you change them. */
export function ReportFilters({ lists, p, selected, sort, dir }: { lists: FilterLists; p: Record<string, string>; selected: string[]; sort: string; dir: string }) {
  const form = useRef<HTMLFormElement>(null);
  const columns = COLUMNS.filter((c) => !c.adminOnly || lists.isAdmin);
  const moreActive = ["industry", "addendum", "late", "term_min", "term_max", "rmr_min", "rmr_max", "install_min", "install_max", "q"].some((k) => p[k]);

  function setColumns(keys: string[]) {
    form.current?.querySelectorAll<HTMLInputElement>('input[name="cols"]').forEach((el) => { el.checked = keys.includes(el.value); });
  }

  return (
    <form ref={form} method="get" action="/reports" className="flex flex-col gap-4"
      onChange={(e) => { const t = e.target as HTMLElement; if (t.tagName === "SELECT") form.current?.requestSubmit(); }}>
      <input type="hidden" name="sort" value={sort} />
      <input type="hidden" name="dir" value={dir} />
      <div className="flex flex-wrap gap-3">
        <Select name="from" label="From month" options={lists.months} value={p.from ?? ""} any="Earliest" />
        <Select name="to" label="To month" options={lists.months} value={p.to ?? ""} any="Latest" />
        {lists.dealerships.length > 1 && <Select name="dealership" label="Dealership" options={lists.dealerships} value={p.dealership ?? ""} any="All dealerships" />}
        {lists.reps.length > 1 && <Select name="rep" label="Rep" options={lists.reps} value={p.rep ?? ""} any="All reps" />}
        <Select name="product" label="Product sold" options={lists.products} value={p.product ?? ""} />
        <Select name="type" label="Customer type" options={TYPES} value={p.type ?? ""} />
        <Select name="newlogo" label="New logo" options={YES_NO} value={p.newlogo ?? ""} />
        <Select name="source" label="Lead source" options={lists.sources} value={p.source ?? ""} />
        {lists.isAdmin && <Select name="audit" label="Audit status" options={AUDIT} value={p.audit ?? ""} />}
      </div>

      <details open={moreActive} className="group">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-bold text-[#3A3D42] [&::-webkit-details-marker]:hidden">
          <span className="transition group-open:rotate-90">▸</span> More filters
        </summary>
        <div className="mt-3 flex flex-wrap gap-3">
          <Select name="industry" label="Industry" options={lists.industries} value={p.industry ?? ""} />
          <Select name="addendum" label="Addendum" options={YES_NO} value={p.addendum ?? ""} />
          <Select name="late" label="Late entry" options={YES_NO} value={p.late ?? ""} />
          <Range label="Term (months)" lo="term_min" hi="term_max" p={p} />
          <Range label="RMR ($)" lo="rmr_min" hi="rmr_max" p={p} />
          <Range label="Install ($)" lo="install_min" hi="install_max" p={p} />
          <label className="min-w-0 flex-[1_1_260px]">
            <span className="mb-[5px] block text-xs font-semibold text-[#3A3D42]">Business or contract number</span>
            <input name="q" defaultValue={p.q ?? ""} placeholder="Search" className={`${ui.input} !h-[42px] ${p.q ? "!bg-[#FBE3E9]" : ""}`} />
          </label>
          <div className="flex items-end"><button className={`${ui.dark} !h-[42px]`}>Apply</button></div>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-2">
        <details className="relative">
          <summary className="inline-flex h-[34px] cursor-pointer list-none items-center rounded-lg border border-[#CFD1D6] bg-white px-3 text-[13px] font-semibold [&::-webkit-details-marker]:hidden">
            Columns: {selected.length} of {columns.length} ▾
          </summary>
          <div className="absolute left-0 z-20 mt-2 w-[min(340px,calc(100vw-48px))] rounded-[14px] border border-[#E6E7EA] bg-white p-4 shadow-[0_12px_30px_rgba(17,18,20,0.14)]">
            <div className="grid max-h-[320px] grid-cols-2 gap-x-4 gap-y-1.5 overflow-y-auto">
              {columns.map((c) => (
                <label key={c.key} className="flex cursor-pointer items-center gap-2 py-1 text-sm font-medium">
                  <input type="checkbox" name="cols" value={c.key} defaultChecked={selected.includes(c.key)} className="size-4 accent-[#C8173F]" />
                  {c.label}
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-[#EEEFF1] pt-3">
              <button type="button" onClick={() => setColumns(columns.map((c) => c.key))} className="text-[13px] font-bold text-[#C8173F] hover:underline">All columns</button>
              <button type="button" onClick={() => setColumns(DEFAULT_COLUMNS)} className="text-[13px] font-bold text-[#C8173F] hover:underline">Usual columns</button>
              <button className={`${ui.dark} !ml-auto !h-9 !px-4 !text-[13px]`}>Apply</button>
            </div>
          </div>
        </details>
        <a href="/reports" className="text-[13px] font-semibold text-[#5B5F66] hover:underline">Clear filters</a>
      </div>
    </form>
  );
}
