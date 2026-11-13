"use client";

import { useState, useTransition } from "react";
import { Pill, ui } from "@/components/ui";
import { DEFAULT_RECALCULATE_FROM, modeFor, parseCards, scoreCard, toRow, type CardIssue, type ImportCard } from "@/lib/import/cards-plan";
import { existingCards, finalizeImportedMonths, importCardsBatch, importContext, type BatchResult, type ImportContext } from "./card-actions";

const BATCH = 100;
const monthName = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

type Plan = {
  files: { name: string; cards: number }[];
  cards: ImportCard[]; already: Set<number>; ctx: ImportContext; issues: CardIssue[]; repaired: number; residential: number;
  blockedPeople: Map<number, { cards: number; years: Set<string> }>; blockedDealerships: Map<number, number>;
};

export function ImportCards() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [recalcFrom, setRecalcFrom] = useState(DEFAULT_RECALCULATE_FROM);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [lock, setLock] = useState<{ months: { month: string; cards: number }[]; through: string; done?: string; error?: string } | null>(null);

  async function read(files: FileList) {
    setError(""); setResult(null); setLock(null); setPlan(null);
    start(async () => {
      try {
        const ExcelJS = (await import("exceljs")).default;
        const cards = new Map<number, ImportCard>();
        const issues: CardIssue[] = [];
        const names: { name: string; cards: number }[] = [];
        let repaired = 0, residential = 0;
        for (const f of Array.from(files)) {
          setBusy(`Reading ${f.name}…`);
          if (!/\.xlsx$/i.test(f.name)) { setError(`${f.name} is not an Excel (.xlsx) file.`); setBusy(""); return; }
          const wb = new ExcelJS.Workbook();
          await wb.xlsx.load(await f.arrayBuffer());
          const ws = wb.worksheets[0];
          const rows: unknown[][] = [];
          ws.eachRow({ includeEmpty: false }, (row) => {
            const v = row.values as unknown[];
            rows.push(Array.from({ length: Math.max(v.length - 1, 0) }, (_, i) => v[i + 1] ?? null));
          });
          const parsed = parseCards(rows);
          parsed.issues.forEach((i) => issues.push({ ...i, text: `${f.name}: ${i.text}` }));
          parsed.cards.forEach((c) => { if (!cards.has(c.legacy_id)) cards.set(c.legacy_id, c); });
          repaired += parsed.repairedRows; residential += parsed.residentialIndustry;
          names.push({ name: f.name, cards: parsed.cards.length });
        }
        setBusy("Checking what is already imported…");
        const ctx = await importContext();
        const list = [...cards.values()];
        const already = new Set<number>();
        for (let i = 0; i < list.length; i += 4000) (await existingCards(list.slice(i, i + 4000).map((c) => c.legacy_id))).forEach((n) => already.add(n));
        const reps = new Set(ctx.reps), ds = new Set(ctx.dealerships);
        const blockedPeople = new Map<number, { cards: number; years: Set<string> }>();
        const blockedDealerships = new Map<number, number>();
        for (const c of list) {
          if (already.has(c.legacy_id)) continue;
          if (!ds.has(c.dealership_legacy_id)) blockedDealerships.set(c.dealership_legacy_id, (blockedDealerships.get(c.dealership_legacy_id) ?? 0) + 1);
          if (!reps.has(c.rep_legacy_id)) {
            const b = blockedPeople.get(c.rep_legacy_id) ?? { cards: 0, years: new Set<string>() };
            b.cards++; b.years.add(c.entry_month.slice(0, 4)); blockedPeople.set(c.rep_legacy_id, b);
          }
        }
        setPlan({ files: names, cards: list, already, ctx, issues, repaired, residential, blockedPeople, blockedDealerships });
      } catch {
        setError("That file could not be read. Check that it is an .xlsx export with the usual columns.");
      }
      setBusy("");
    });
  }

  const ready = plan ? plan.cards.filter((c) => !plan.already.has(c.legacy_id) && plan.ctx.reps.includes(c.rep_legacy_id) && plan.ctx.dealerships.includes(c.dealership_legacy_id)) : [];
  const years = plan ? [...new Set(plan.cards.map((c) => c.entry_month.slice(0, 4)))].sort() : [];
  const calc = ready.filter((c) => modeFor(c, recalcFrom) === "calculate");
  const diffs = plan ? calc.filter((c) => c.old_points != null && scoreCard(c, plan.ctx.products) !== c.old_points) : [];

  function run() {
    if (!plan) return;
    setError("");
    start(async () => {
      try {
        const total: BatchResult = { inserted: 0, skipped: 0, overrides: 0, errors: [] };
        setProgress({ done: 0, total: ready.length });
        let done = 0;
        for (const mode of ["recorded", "calculate"] as const) {
          const group = ready.filter((c) => modeFor(c, recalcFrom) === mode);
          // Oldest first, so each company's first card is already in when a later one is checked.
          group.sort((a, b) => a.entry_month.localeCompare(b.entry_month) || a.sale_date.localeCompare(b.sale_date) || a.legacy_id - b.legacy_id);
          for (let i = 0; i < group.length; i += BATCH) {
            const r = await importCardsBatch(group.slice(i, i + BATCH).map((c) => toRow(c, mode)), mode);
            total.inserted += r.inserted; total.skipped += r.skipped; total.overrides += r.overrides; total.errors.push(...r.errors);
            done += Math.min(BATCH, group.length - i);
            setProgress({ done, total: ready.length });
          }
        }
        setResult(total);
        const ctx = await importContext();
        const months = ctx.openMonths;
        setLock({ months, through: months.length > 1 ? months[months.length - 2].month : "" });
        setPlan(null);
      } catch {
        setError("The import stopped part-way. It is safe to upload the same files and run it again: cards already imported are skipped.");
      }
      setProgress(null);
    });
  }

  function lockMonths() {
    if (!lock?.through) return;
    start(async () => {
      const r = await finalizeImportedMonths(lock.through);
      setLock({ ...lock, done: r.months != null ? `Locked ${r.months} ${r.months === 1 ? "month" : "months"} through ${monthName(lock.through)}. Their rankings are saved.` : undefined, error: r.error });
    });
  }

  return (
    <section className={`${ui.card} flex flex-col gap-5 p-6`}>
      <div>
        <h2 className="text-lg font-extrabold">Tally card history</h2>
        <p className="mt-1 text-sm text-[#5B5F66]">
          Upload the exports from the old system, one or several files at once. Import the people and dealerships first. You see everything before it is saved.
          Cards already imported are skipped, so a fuller export later only adds what is missing. Years before the cut-off keep the points the old system recorded; later years are scored with the current rules.
        </p>
      </div>

      <label className="flex flex-col">
        <span className={ui.label}>Excel exports (.xlsx)</span>
        <input type="file" accept=".xlsx" multiple disabled={pending} onChange={(e) => { if (e.target.files?.length) void read(e.target.files); }} className={`${ui.input} h-auto py-2`} />
      </label>
      {busy && <p className="text-sm text-[#5B5F66]">{busy}</p>}
      {error && <p role="alert" className="text-sm font-semibold text-[#C8173F]">{error}</p>}

      {plan && (
        <div className="flex flex-col gap-4 border-t border-[#EEEFF1] pt-5">
          <div className="flex flex-wrap gap-2">
            {plan.files.map((f) => <Pill key={f.name} tone="dark">{f.name}: {f.cards.toLocaleString()} cards</Pill>)}
            <Pill tone={ready.length ? "crimson" : "light"}>To import: {ready.length.toLocaleString()}</Pill>
            <Pill tone="light">Already imported: {plan.already.size.toLocaleString()}</Pill>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#E6E7EA]">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-[#5B5F66]"><tr><th className="px-4 py-2">Year</th><th className="px-3 py-2">Cards</th><th className="px-3 py-2">To import</th><th className="px-3 py-2">New logos</th><th className="px-3 py-2">Points</th></tr></thead>
              <tbody>
                {years.map((y) => {
                  const inYear = plan.cards.filter((c) => c.entry_month.startsWith(y));
                  return (
                    <tr key={y} className="border-t border-[#F1F2F4]">
                      <td className="px-4 py-2 font-semibold">{y}</td>
                      <td className="px-3 py-2 tabular-nums">{inYear.length.toLocaleString()}</td>
                      <td className="px-3 py-2 tabular-nums">{ready.filter((c) => c.entry_month.startsWith(y)).length.toLocaleString()}</td>
                      <td className="px-3 py-2 tabular-nums">{inYear.filter((c) => c.customer_type === "new_logo").length.toLocaleString()}</td>
                      <td className="px-3 py-2">{Number(y) >= recalcFrom ? "Scored with the current rules" : "Kept as the old system recorded"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <label className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-bold">Score with the current rules from year</span>
            <input type="number" min={2000} max={2100} value={recalcFrom} onChange={(e) => setRecalcFrom(Number(e.target.value) || DEFAULT_RECALCULATE_FROM)} className={`${ui.input} w-28`} />
            <span className="text-[#5B5F66]">Earlier years are locked history with no leaderboards.</span>
          </label>

          {calc.length > 0 && (
            <div className="rounded-xl border border-[#E6E7EA] p-4 text-sm">
              <p className="font-extrabold">Points check ({calc.length.toLocaleString()} cards scored with the current rules)</p>
              <p className="mt-1 text-[#5B5F66]">
                {(calc.length - diffs.length).toLocaleString()} cards get exactly the points the old system recorded.
                {diffs.length > 0 && ` ${diffs.length} differ. They keep the old system's number, with a note in the audit record, so totals do not change:`}
              </p>
              {diffs.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {diffs.slice(0, 15).map((c) => <li key={c.legacy_id}>{c.business_name} ({c.entry_month.slice(0, 7)}): old system {c.old_points}, rules give {scoreCard(c, plan.ctx.products)}</li>)}
                </ul>
              )}
            </div>
          )}

          {(plan.blockedPeople.size > 0 || plan.blockedDealerships.size > 0) && (
            <div role="alert" className="rounded-xl border border-[#F2C4CF] bg-[#FDF1F4] p-4 text-sm">
              <p className="font-extrabold text-[#9E1031]">Some cards will wait until their person or dealership is imported</p>
              {plan.blockedPeople.size > 0 && (
                <p className="mt-1">
                  {[...plan.blockedPeople.values()].reduce((s, b) => s + b.cards, 0).toLocaleString()} cards belong to {plan.blockedPeople.size} {plan.blockedPeople.size === 1 ? "person" : "people"} who are not in the system yet (old IDs:{" "}
                  {[...plan.blockedPeople.keys()].slice(0, 25).join(", ")}{plan.blockedPeople.size > 25 ? ", …" : ""}). Add them to the users workbook, import it above, and upload these files again.
                </p>
              )}
              {plan.blockedDealerships.size > 0 && <p className="mt-1">Dealership IDs not imported: {[...plan.blockedDealerships.keys()].join(", ")}.</p>}
            </div>
          )}

          {(plan.issues.length > 0 || plan.repaired > 0 || plan.residential > 0) && (
            <div className="rounded-xl border border-[#F0DDB0] bg-[#FFF8E5] p-4 text-sm">
              <p className="font-extrabold text-[#7A5A00]">Worth knowing</p>
              <ul className="mt-1 flex flex-col gap-1">
                {plan.issues.map((i, k) => <li key={k}>{i.text}{i.count ? `: ${i.count}` : ""}</li>)}
                {plan.repaired > 0 && <li>{plan.repaired} pieces of comments that the export had split onto separate rows were put back on their cards.</li>}
                {plan.residential > 0 && <li>{plan.residential} cards have the industry Residential but were not marked residential in the old system. They are imported as ordinary cards, as the old system counted them. You can change any of them in audit.</li>}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button className={ui.primary} disabled={pending || ready.length === 0} onClick={run}>
              {progress ? `Importing ${progress.done.toLocaleString()} of ${progress.total.toLocaleString()}…` : pending ? "Working…" : `Import ${ready.length.toLocaleString()} cards`}
            </button>
            {ready.length === 0 && <span className="text-sm text-[#5B5F66]">Nothing new to import from these files.</span>}
          </div>
        </div>
      )}

      {result && (
        <div role="status" className="flex flex-col gap-3 border-t border-[#EEEFF1] pt-5">
          <p className="text-[15px] font-extrabold text-[#1F7A3D]">Cards imported</p>
          <div className="flex flex-wrap gap-2">
            <Pill tone="green">Imported: {result.inserted.toLocaleString()}</Pill>
            {result.skipped > 0 && <Pill tone="light">Already there: {result.skipped}</Pill>}
            {result.overrides > 0 && <Pill tone="light">Old points kept: {result.overrides}</Pill>}
            {result.errors.length > 0 && <Pill tone="crimson">Problems: {result.errors.length}</Pill>}
          </div>
          {result.errors.slice(0, 20).map((e, i) => <p key={i} className="text-sm text-[#9E1031]">Card {e.legacy_id}: {e.error}</p>)}
        </div>
      )}

      {lock && lock.months.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-[#EEEFF1] pt-5">
          <div>
            <h3 className="text-[15px] font-extrabold">Lock the months</h3>
            <p className="mt-1 text-sm text-[#5B5F66]">
              Do this once every year’s file is in. Months scored with the current rules stay open until you lock them. Locking saves their rankings, so the leaderboards and Supreme Titan show them.
              Leave the newest months open to audit them in the new app.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[220px]">
              <span className={ui.label}>Lock through</span>
              <select className={ui.input} value={lock.through} onChange={(e) => setLock({ ...lock, through: e.target.value })}>
                <option value="">Choose a month…</option>
                {lock.months.map((m) => <option key={m.month} value={m.month}>{monthName(m.month)} ({m.cards.toLocaleString()} cards)</option>)}
              </select>
            </label>
            <button className={ui.dark} disabled={pending || !lock.through} onClick={lockMonths}>Lock these months</button>
          </div>
          {lock.done && <p role="status" className="text-sm font-semibold text-[#1F7A3D]">{lock.done}</p>}
          {lock.error && <p role="alert" className="text-sm font-semibold text-[#C8173F]">{lock.error}</p>}
        </div>
      )}
    </section>
  );
}
