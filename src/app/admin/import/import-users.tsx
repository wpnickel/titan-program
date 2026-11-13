"use client";

import { useState, useTransition } from "react";
import { Pill, ui } from "@/components/ui";
import { wantsLogin } from "@/lib/import/users-plan";
import { importDealerships, importPeople, previewUsers, type ImportOutcome, type UsersPreview } from "./actions";

type Ok = Extract<UsersPreview, { ok: true }>;
const CHUNK = 10;

export function ImportUsers() {
  const [preview, setPreview] = useState<Ok | null>(null);
  const [error, setError] = useState("");
  const [includeFormer, setIncludeFormer] = useState(false);
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ dealerships: { created: number; existing: number; errors: string[] }; people: ImportOutcome[] } | null>(null);

  function upload(formData: FormData) {
    setError(""); setResult(null);
    start(async () => {
      const r = await previewUsers(formData);
      if (!r.ok) { setPreview(null); setError(r.error); } else setPreview(r);
    });
  }

  function run() {
    if (!preview) return;
    setError("");
    start(async () => {
      try {
        const todoD = preview.dealerships.filter((d) => d.action === "create");
        const dealerships = await importDealerships(todoD);
        const todoP = preview.people.filter((p) => p.action === "create");
        const people: ImportOutcome[] = [];
        setProgress({ done: 0, total: todoP.length });
        for (let i = 0; i < todoP.length; i += CHUNK) {
          people.push(...(await importPeople(todoP.slice(i, i + CHUNK), includeFormer)));
          setProgress({ done: Math.min(i + CHUNK, todoP.length), total: todoP.length });
        }
        setResult({ dealerships, people });
        setPreview(null);
      } catch {
        setError("The import stopped part-way. It is safe to upload the same file and run it again: anything already imported is skipped.");
      }
      setProgress(null);
    });
  }

  const errors = preview?.issues.filter((i) => i.level === "error") ?? [];
  const warnings = preview?.issues.filter((i) => i.level === "warning") ?? [];
  const toCreate = preview?.people.filter((p) => p.action === "create") ?? [];
  const logins = toCreate.filter((p) => wantsLogin(p, includeFormer));
  const historyOnly = toCreate.length - logins.length;
  const former = toCreate.filter((p) => p.role === "Salesperson" && !wantsLogin(p, false)).length;

  return (
    <section className={`${ui.card} flex flex-col gap-5 p-6`}>
      <div>
        <h2 className="text-lg font-extrabold">People and dealerships</h2>
        <p className="mt-1 text-sm text-[#5B5F66]">
          Upload the Users and Dealerships workbook. You see exactly what would happen first, and nothing is saved until you press Import.
          You can upload an updated workbook later: people and dealerships already imported are matched by their old ID and skipped, so nothing is duplicated.
          No emails are sent.
        </p>
      </div>

      <form action={upload} className="flex flex-wrap items-end gap-3">
        <label className="min-w-[260px] flex-1">
          <span className={ui.label}>Excel file (.xlsx)</span>
          <input type="file" name="file" accept=".xlsx" required className={`${ui.input} h-auto py-2`} />
        </label>
        <button className={ui.dark} disabled={pending}>{pending && !progress ? "Reading…" : "Check the file"}</button>
      </form>

      {error && <p role="alert" className="text-sm font-semibold text-[#C8173F]">{error}</p>}

      {preview && (
        <div className="flex flex-col gap-4 border-t border-[#EEEFF1] pt-5">
          <div className="flex flex-wrap gap-2">
            <Pill tone="dark">{preview.fileName}</Pill>
            <Pill tone={preview.dealerships.some((d) => d.action === "create") ? "crimson" : "light"}>
              Dealerships: {preview.dealerships.filter((d) => d.action === "create").length} to add, {preview.dealerships.filter((d) => d.action === "exists").length} already there
            </Pill>
            <Pill tone={logins.length ? "crimson" : "light"}>Logins to create: {logins.length}</Pill>
            {historyOnly > 0 && <Pill tone="light">History only (no login): {historyOnly}</Pill>}
            <Pill tone="light">People already there: {preview.people.length - toCreate.length}</Pill>
          </div>

          {former > 0 && (
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={includeFormer} onChange={(e) => setIncludeFormer(e.target.checked)} className="mt-0.5 size-4 accent-[#C8173F]" />
              <span>
                <span className="font-bold">Also create logins for the {former} salespeople with no 2026 cards.</span>
                <span className="block text-[#5B5F66]">They are created switched off, so nobody can sign in until you turn them on. Their cards are imported either way.</span>
              </span>
            </label>
          )}

          {errors.length > 0 && (
            <div role="alert" className="rounded-xl border border-[#F2C4CF] bg-[#FDF1F4] p-4">
              <p className="text-sm font-extrabold text-[#9E1031]">Fix these in the workbook, then check it again ({errors.length})</p>
              <ul className="mt-2 flex flex-col gap-1 text-sm">{errors.map((e, i) => <li key={i}><span className="font-semibold">{e.where}:</span> {e.text}</li>)}</ul>
            </div>
          )}
          {warnings.length > 0 && (
            <div className="rounded-xl border border-[#F0DDB0] bg-[#FFF8E5] p-4">
              <p className="text-sm font-extrabold text-[#7A5A00]">Adjusted automatically ({warnings.length})</p>
              <ul className="mt-2 flex flex-col gap-1 text-sm">{warnings.map((e, i) => <li key={i}><span className="font-semibold">{e.where}:</span> {e.text}</li>)}</ul>
            </div>
          )}

          <details className="rounded-xl border border-[#E6E7EA]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-bold">See everyone ({preview.people.length})</summary>
            <div className="max-h-[360px] overflow-auto border-t border-[#EEEFF1]">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-white text-xs text-[#5B5F66]"><tr><th className="px-4 py-2">Name</th><th className="px-3 py-2">Dealership</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">What happens</th></tr></thead>
                <tbody>
                  {preview.people.map((p) => (
                    <tr key={p.legacyId} className="border-t border-[#F1F2F4]">
                      <td className="px-4 py-2 font-semibold">{p.first} {p.last}<span className="block text-xs font-normal text-[#5B5F66]">{p.email}</span></td>
                      <td className="px-3 py-2">{p.dealership}</td>
                      <td className="px-3 py-2">{p.role}</td>
                      <td className="px-3 py-2">{p.action === "exists" ? "Already there" : wantsLogin(p, includeFormer) ? (p.loginActive ? "Create login" : "Create login (switched off)") : "History only"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <div className="flex flex-wrap items-center gap-3">
            <button className={ui.primary} disabled={pending || errors.length > 0 || (toCreate.length === 0 && !preview.dealerships.some((d) => d.action === "create"))} onClick={run}>
              {progress ? `Importing ${progress.done} of ${progress.total}…` : pending ? "Importing…" : "Import"}
            </button>
            {errors.length > 0 && <span className="text-sm text-[#5B5F66]">Import is off until the problems above are fixed.</span>}
            {toCreate.length === 0 && !preview.dealerships.some((d) => d.action === "create") && errors.length === 0 && <span className="text-sm text-[#5B5F66]">Everything in this file is already imported.</span>}
          </div>
        </div>
      )}

      {result && (
        <div role="status" className="flex flex-col gap-3 border-t border-[#EEEFF1] pt-5">
          <p className="text-[15px] font-extrabold text-[#1F7A3D]">Import finished</p>
          <div className="flex flex-wrap gap-2">
            <Pill tone="green">Dealerships added: {result.dealerships.created}</Pill>
            <Pill tone="green">Logins created: {result.people.filter((r) => r.outcome === "created").length}</Pill>
            <Pill tone="light">History only: {result.people.filter((r) => r.outcome === "history").length}</Pill>
            <Pill tone="light">Already there: {result.people.filter((r) => r.outcome === "exists").length + result.dealerships.existing}</Pill>
            {result.people.some((r) => r.outcome === "error") && <Pill tone="crimson">Problems: {result.people.filter((r) => r.outcome === "error").length}</Pill>}
          </div>
          {[...result.dealerships.errors.map((t) => ({ t })), ...result.people.filter((r) => r.outcome === "error" || (r.outcome === "created" && r.note?.startsWith("Created, but"))).map((r) => ({ t: `${r.name}: ${r.note}` }))].map((x, i) => (
            <p key={i} className="text-sm text-[#9E1031]">{x.t}</p>
          ))}
          <p className="text-sm text-[#5B5F66]">No invites were sent. Open Users to review everyone, and send invites from there when you are ready.</p>
        </div>
      )}
    </section>
  );
}
