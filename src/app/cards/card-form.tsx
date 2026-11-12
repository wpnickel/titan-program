"use client";

import { createClient as createBrowserClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WarningDialog } from "@/components/dialog";
import { Pill, ui } from "@/components/ui";
import {
  CUSTOMER_TYPES, MAX_UPLOAD_BYTES, UPLOAD_TCV, money, needsUpload, newLogoChecks, previewPoints, tcvOf,
  type CardPayload, type CustomerType, type FileInfo, type Option, type ProductInfo, type RepOption,
} from "@/lib/cards";
import { deleteCard, finishUpload, findSimilar, prepareUpload, removeFile, saveCard, submitCard } from "./actions";

export type CardFormProps = {
  initial: {
    id?: string; submitted: boolean; rep_id: string; entry_month: string; sale_date: string; business_name: string;
    zip_code: string; industry_id: string; customer_type: CustomerType; addendum: boolean; contract_number: string;
    term_months: string; install_amount: string; rmr_amount: string; comments: string;
    quantities: Record<string, number>; lead_source_ids: string[]; files: FileInfo[];
  };
  reps: RepOption[];
  months: string[];
  industries: Option[];
  leadSources: Option[];
  products: ProductInfo[];
  readOnlyReason?: string;
};

type Step = "similar" | "short" | "residential";
type Dialog = Step | "pdf" | "delete" | "saved" | null;

const monthName = (iso: string, withYear = false) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
const num = (s: string) => {
  const n = parseFloat(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const fileSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className={`${ui.card} flex flex-col gap-[18px] p-6`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-extrabold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Segmented<T extends string>({ label, options, value, onChange, tall }: {
  label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; tall?: boolean;
}) {
  return (
    <div>
      <div className={ui.label}>{label}</div>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5 rounded-xl bg-[#F0F0F2] p-1">
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
            className={`flex-1 basis-24 cursor-pointer rounded-[9px] text-sm font-semibold transition ${tall ? "h-[42px]" : "h-[38px]"} ${o.value === value ? "bg-[#111214] text-white" : "text-[#3A3D42] hover:bg-white/70"}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CardForm({ initial, reps, months, industries, leadSources, products, readOnlyReason }: CardFormProps) {
  const router = useRouter();
  const [cardId, setCardId] = useState(initial.id);
  const [submitted, setSubmitted] = useState(initial.submitted);
  const [repId, setRepId] = useState(initial.rep_id);
  const [month, setMonth] = useState(initial.entry_month);
  const [type, setType] = useState<CustomerType>(initial.customer_type);
  const [name, setName] = useState(initial.business_name);
  const [zip, setZip] = useState(initial.zip_code);
  const [industry, setIndustry] = useState(initial.industry_id);
  const [sources, setSources] = useState(new Set(initial.lead_source_ids));
  const [contract, setContract] = useState(initial.contract_number);
  const [saleDate, setSaleDate] = useState(initial.sale_date);
  const [addendum, setAddendum] = useState(initial.addendum);
  const [term, setTerm] = useState(initial.term_months);
  const [install, setInstall] = useState(initial.install_amount);
  const [rmr, setRmr] = useState(initial.rmr_amount);
  const [qty, setQty] = useState<Record<string, number>>(initial.quantities);
  const [comments, setComments] = useState(initial.comments);
  const [files, setFiles] = useState<FileInfo[]>(initial.files);
  const [similar, setSimilar] = useState<{ name: string; firstSale: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [queue, setQueue] = useState<Step[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const termInput = useRef<HTMLInputElement>(null);
  const readOnly = Boolean(readOnlyReason);

  const rep = reps.find((r) => r.id === repId);
  const dealershipId = rep?.dealership_id;
  const dealershipNames = [...new Set(reps.map((r) => r.dealership))];

  const termN = Math.round(num(term));
  const installN = num(install);
  const rmrN = num(rmr);
  const tcv = tcvOf(rmrN, termN, installN);
  const points = useMemo(() => previewPoints(products, qty, termN), [products, qty, termN]);
  const qualifying = products.filter((p) => p.qualifies_new_logo && (qty[p.id] ?? 0) > 0).map((p) => p.label.replace(/\s*\(.*\)$/, ""));
  const checks = newLogoChecks({ type, addendum, qualifying, rmr: rmrN, install: installN, term: termN, similar: similar[0]?.name ?? null });
  const uploadRequired = needsUpload(type, tcv);
  // A submitted card that did not need a PDF before, but does after this edit, cannot be saved until one is added.
  const initiallyNeededUpload = needsUpload(initial.customer_type, tcvOf(num(initial.rmr_amount), Math.round(num(initial.term_months)), num(initial.install_amount)));
  const editNeedsPdf = submitted && uploadRequired && files.length === 0 && !initiallyNeededUpload;
  const isLate = Boolean(saleDate) && saleDate < month;

  // Look for a similar customer at the same dealership while the name is typed.
  useEffect(() => {
    if (readOnly || !dealershipId || name.trim().length < 4) { setSimilar([]); return; }
    const t = setTimeout(async () => {
      try { setSimilar(await findSimilar(dealershipId, name, cardId)); } catch { setSimilar([]); }
    }, 500);
    return () => clearTimeout(t);
  }, [name, dealershipId, cardId, readOnly]);

  const payload = (): CardPayload => ({
    id: cardId, rep_id: repId, entry_month: month, sale_date: saleDate, business_name: name.trim(), zip_code: zip.trim(),
    industry_id: industry, customer_type: type, addendum, contract_number: contract.trim(), term_months: termN,
    install_amount: installN, rmr_amount: rmrN, comments: comments.trim(),
    products: Object.entries(qty).filter(([, q]) => q > 0).map(([product_id, quantity]) => ({ product_id, quantity })),
    lead_source_ids: [...sources],
  });

  /** Save the card as it stands and remember its id. */
  async function persist(): Promise<string | null> {
    if (!repId || !month || !saleDate || !name.trim()) {
      setMessage({ kind: "error", text: "Choose the salesperson and month, and enter the business name and date of sale first." });
      return null;
    }
    const r = await saveCard(payload());
    if (r.error || !r.id) { setMessage({ kind: "error", text: r.error ?? "Could not save the card." }); return null; }
    if (!cardId) { setCardId(r.id); window.history.replaceState(null, "", `/cards/${r.id}`); }
    return r.id;
  }

  async function saveDraft() {
    setMessage(null);
    if (editNeedsPdf) {
      setMessage({ kind: "error", text: "This card now needs a PDF (new logos, residential, and contracts of $15,000 or more). Add the PDF below, then save your changes." });
      return;
    }
    setBusy("save");
    const id = await persist();
    if (id) setMessage({ kind: "ok", text: submitted ? "Changes saved." : "Draft saved. Submit it when it is ready." });
    setBusy(null);
  }

  function attemptSubmit() {
    setMessage(null);
    if (!industry || sources.size === 0 || !contract.trim()) {
      setMessage({ kind: "error", text: "Choose an industry and at least one lead source, and enter the contract number." });
      return;
    }
    const steps: Step[] = [];
    if (termN < 12) steps.push("short");
    if (type === "residential" && points.total === 0) steps.push("residential");
    if (type === "new_logo" && !addendum && similar.length > 0) steps.push("similar");
    runSteps(steps);
  }

  function runSteps(steps: Step[]) {
    if (steps.length === 0) { setDialog(null); void finish(); return; }
    setQueue(steps.slice(1)); setDialog(steps[0]!);
  }
  const nextStep = () => runSteps(queue);

  async function finish() {
    setBusy("submit");
    const id = await persist();
    if (id) {
      if (uploadRequired && files.length === 0) {
        setMessage({ kind: "error", text: "This card needs a PDF before it can be submitted (new logos, residential, and contracts of $15,000 or more). It was saved as a draft." });
      } else {
        const r = await submitCard(id);
        if (r.error) setMessage({ kind: "error", text: r.error });
        else { setSubmitted(true); setDialog("saved"); setBusy(null); return; }
      }
    }
    setBusy(null);
  }

  async function addFiles(list: FileList | File[]) {
    const picked = [...list];
    if (picked.length === 0) return;
    if (picked.some((f) => !/\.pdf$/i.test(f.name) && f.type !== "application/pdf")) { setDialog("pdf"); return; }
    setBusy("upload"); setMessage(null);
    const id = cardId ?? (await persist());
    if (!id) { setBusy(null); return; }
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    for (const f of picked) {
      if (f.size > MAX_UPLOAD_BYTES) { setMessage({ kind: "error", text: `${f.name} is larger than 20 MB.` }); continue; }
      const prep = await prepareUpload(id, f.name, f.size);
      if (prep.error || !prep.path || !prep.token) { setMessage({ kind: "error", text: prep.error ?? "Upload failed." }); continue; }
      const up = await sb.storage.from("tally-uploads").uploadToSignedUrl(prep.path, prep.token, f, { contentType: "application/pdf" });
      if (up.error) { setMessage({ kind: "error", text: `${f.name} could not be uploaded. Please try again.` }); continue; }
      const done = await finishUpload(id, prep.path, f.name);
      if (done.error || !done.file) { setMessage({ kind: "error", text: `${f.name}: ${done.error ?? "upload failed."}` }); continue; }
      setFiles((cur) => [...cur, done.file!]);
    }
    setBusy(null);
  }

  async function dropFile(f: FileInfo) {
    setBusy("upload");
    const r = await removeFile(f.id);
    if (r.error) setMessage({ kind: "error", text: r.error }); else setFiles((cur) => cur.filter((x) => x.id !== f.id));
    setBusy(null);
  }

  async function confirmDelete() {
    setDialog(null);
    if (!cardId) return;
    setBusy("delete");
    const r = await deleteCard(cardId);
    if (r?.error) { setMessage({ kind: "error", text: r.error }); setBusy(null); }
  }

  const label = (id: string, text: string, extra?: ReactNode) => (
    <label htmlFor={id} className={ui.label}>{text}{extra}</label>
  );
  const sourceNames = leadSources;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3.5">
        <h1 className="text-[30px] font-extrabold tracking-tight">{initial.id ? "Tally card" : cardId ? "Tally card" : "New tally card"}</h1>
        <Pill tone={submitted ? "green" : "light"}>{submitted ? "Submitted" : "Draft"}</Pill>
        {isLate && <Pill tone="crimson">Late entry</Pill>}
        <span className="text-[13px] text-[#5B5F66]">{rep ? `${rep.dealership} · ` : ""}entering for {monthName(month, true)}</span>
      </div>

      {readOnlyReason && (
        <p className="rounded-xl bg-[#FFF4DC] px-4 py-3 text-sm font-semibold text-[#7A4B00]">{readOnlyReason}</p>
      )}

      <fieldset disabled={readOnly} className="m-0 flex min-w-0 flex-wrap items-start gap-6 border-0 p-0">
        <div className="flex min-w-0 flex-[1_1_700px] flex-col gap-5">
          <Section title="Customer">
            <div className="flex flex-wrap gap-4">
              <div className="min-w-[240px] flex-1">
                {label("rep", "Rep")}
                <select id="rep" value={repId} onChange={(e) => setRepId(e.target.value)} className={ui.input}>
                  {!rep && <option value={repId}>Choose a salesperson</option>}
                  {dealershipNames.length > 1
                    ? dealershipNames.map((d) => (
                        <optgroup key={d} label={d}>
                          {reps.filter((r) => r.dealership === d).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </optgroup>
                      ))
                    : reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="min-w-[240px] flex-1">
                <Segmented label="Entry month" value={month} onChange={setMonth}
                  options={[...months].reverse().map((m, _i, all) => ({ value: m, label: monthName(m, new Set(all.map((x) => x.slice(0, 4))).size > 1) }))} />
              </div>
            </div>
            <Segmented label="Customer type" value={type} onChange={setType} options={CUSTOMER_TYPES} tall />
            <div className="flex flex-wrap gap-4">
              <div className="min-w-[260px] flex-[2_1_320px]">
                {label("biz", "Business name")}
                <input id="biz" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoComplete="off"
                  className={`${ui.input} ${type === "new_logo" && !addendum && similar.length ? "!border-2 !border-[#B7791F]" : ""}`} />
                {type === "new_logo" && !addendum && similar.length > 0 && (
                  <p className="mt-1.5 rounded-lg bg-[#FFF4DC] px-2.5 py-2 text-[13px] font-medium text-[#7A4B00]">
                    Similar customer found at this dealership: {similar[0]!.name} (first sold {new Date(`${similar[0]!.firstSale}T00:00:00Z`).getUTCFullYear()}). Verify this is a new logo.
                  </p>
                )}
              </div>
              <div className="min-w-[120px] flex-[1_1_140px]">
                {label("zip", "Zip code")}
                <input id="zip" value={zip} onChange={(e) => setZip(e.target.value)} inputMode="numeric" maxLength={10} className={ui.input} />
              </div>
              <div className="min-w-[180px] flex-[1_1_200px]">
                {label("ind", "Industry")}
                <select id="ind" value={industry} onChange={(e) => setIndustry(e.target.value)} className={ui.input}>
                  <option value="">Choose an industry</option>
                  {industries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <div className={ui.label}>Lead source <span className="font-medium text-[#5B5F66]">(pick at least one)</span></div>
              <div className="flex flex-wrap gap-2">
                {sourceNames.map((s) => {
                  const on = sources.has(s.id);
                  return (
                    <button key={s.id} type="button" aria-pressed={on}
                      onClick={() => setSources((cur) => { const n = new Set(cur); if (on) n.delete(s.id); else n.add(s.id); return n; })}
                      className={`h-[38px] cursor-pointer rounded-full border px-3.5 text-[13px] font-semibold transition ${on ? "border-[#111214] bg-[#111214] text-white" : "border-[#CFD1D6] bg-white text-[#3A3D42] hover:border-[#111214]"}`}>
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </Section>

          <Section title="Contract">
            <div className="flex flex-wrap gap-4">
              <div className="min-w-[180px] flex-[1_1_200px]">
                {label("cn", "Contract number")}
                <input id="cn" value={contract} onChange={(e) => setContract(e.target.value)} maxLength={60} className={ui.input} />
              </div>
              <div className="min-w-[180px] flex-[1_1_200px]">
                {label("dos", "Date of sale")}
                <input id="dos" type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} className={ui.input} />
                {isLate && <p className="mt-1.5 text-xs font-semibold text-[#9E1031]">This sale is before {monthName(month)}, so it will be flagged as a late entry.</p>}
              </div>
              <div className="min-w-[180px] flex-[1_1_200px]">
                <Segmented label="Addendum" value={addendum ? "yes" : "no"} onChange={(v) => setAddendum(v === "yes")}
                  options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes" }]} />
                <p className="mt-1.5 text-xs text-[#5B5F66]">Choosing Yes turns off New logo.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="min-w-[140px] flex-[1_1_160px]">
                {label("term", "Term (months)")}
                <input id="term" ref={termInput} value={term} onChange={(e) => setTerm(e.target.value)} inputMode="numeric" className={ui.input} />
              </div>
              <div className="min-w-[140px] flex-[1_1_160px]">
                {label("inst", "Installation ($)")}
                <input id="inst" value={install} onChange={(e) => setInstall(e.target.value)} inputMode="decimal" className={ui.input} />
              </div>
              <div className="min-w-[140px] flex-[1_1_160px]">
                {label("rmr", "RMR ($)")}
                <input id="rmr" value={rmr} onChange={(e) => setRmr(e.target.value)} inputMode="decimal" className={ui.input} />
              </div>
              <div className="min-w-[140px] flex-[1_1_160px]">
                {label("tcv", "TCV ($) · calculated")}
                <input id="tcv" readOnly value={tcv.toLocaleString("en-US", { maximumFractionDigits: 2 })} className={`${ui.input} !border-[#E6E7EA] !bg-[#F5F5F6] font-bold`} />
              </div>
            </div>
          </Section>

          <Section title="Products" aside={<span className="text-[13px] text-[#5B5F66]">Points count once per card, not per unit.</span>}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {products.map((p) => {
                const q = qty[p.id] ?? 0;
                const set = (n: number) => setQty((cur) => ({ ...cur, [p.id]: Math.max(0, Math.min(999, n)) }));
                return (
                  <div key={p.id} className={`flex min-w-0 flex-col justify-between gap-2.5 rounded-[14px] border-2 p-3.5 ${q > 0 ? "border-[#111214] bg-white" : "border-[#E6E7EA] bg-[#FAFAFB]"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-bold">{p.label}</span>
                      <span className={`whitespace-nowrap rounded-full px-[9px] py-[3px] text-xs font-bold ${p.points ? "bg-[#FBE3E9] text-[#9E1031]" : "bg-[#F0F0F2] text-[#5B5F66]"}`}>
                        {p.points ? `${p.points} ${p.points === 1 ? "pt" : "pts"}` : "No points"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-[#5B5F66]">{p.needs_audio_sensor ? "Needs audio sensors" : ""}</span>
                      <span className="inline-flex items-center gap-1">
                        <button type="button" aria-label={`Decrease ${p.label}`} onClick={() => set(q - 1)} className="size-8 cursor-pointer rounded-lg border border-[#CFD1D6] bg-white text-base font-bold hover:border-[#111214]">−</button>
                        <input aria-label={`${p.label} quantity`} value={q} inputMode="numeric" onChange={(e) => set(parseInt(e.target.value.replace(/\D/g, ""), 10) || 0)}
                          className="w-12 rounded-md border-0 bg-transparent text-center text-[15px] font-extrabold tabular-nums outline-none focus:ring-2 focus:ring-[#C8173F]/30" />
                        <button type="button" aria-label={`Increase ${p.label}`} onClick={() => set(q + 1)} className="size-8 cursor-pointer rounded-lg border border-[#CFD1D6] bg-white text-base font-bold hover:border-[#111214]">+</button>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Supporting documents"
            aside={uploadRequired
              ? <span className="rounded-full bg-[#FFF4DC] px-2.5 py-1 text-[13px] font-semibold text-[#7A4B00]">Required for this card</span>
              : <span className="text-[13px] text-[#5B5F66]">Required for new logos, residential, and contracts of {money(UPLOAD_TCV)} or more</span>}>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files); }}
              className={`flex flex-wrap items-center gap-4 rounded-[14px] border-2 border-dashed p-[22px] transition ${dragging ? "border-[#C8173F] bg-[#FBE7EC]" : "border-[#B8BBC2] bg-[#FAFAFB]"}`}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#111214" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
              <div className="min-w-[200px] flex-1">
                <div className="text-[15px] font-bold">Drop PDF files here</div>
                <div className="text-[13px] text-[#5B5F66]">PDF only, up to 20 MB each. Add as many as you need; each stays a separate file.</div>
              </div>
              <input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple hidden
                onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
              <button type="button" onClick={() => fileInput.current?.click()} disabled={busy === "upload"} className="h-[42px] cursor-pointer rounded-[10px] border border-[#111214] bg-white px-[18px] text-sm font-bold hover:bg-[#F5F5F6] disabled:opacity-60">
                {busy === "upload" ? "Uploading…" : "Browse files"}
              </button>
            </div>
            {files.length > 0 && (
              <ul className="flex flex-col gap-2">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 rounded-xl border border-[#E6E7EA] px-3.5 py-2.5">
                    <span className="flex size-[34px] items-center justify-center rounded-lg bg-[#111214] text-[11px] font-extrabold text-white">PDF</span>
                    <a href={`/cards/files/${f.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-semibold !text-[#111214] hover:!text-[#C8173F]">{f.file_name}</a>
                    <span className="text-[13px] text-[#5B5F66]">{fileSize(f.size_bytes)}</span>
                    <button type="button" onClick={() => void dropFile(f)} disabled={busy === "upload"} className="cursor-pointer p-1.5 text-[13px] font-semibold text-[#C8173F] hover:underline">Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <section className={`${ui.card} flex flex-col gap-2 p-6`}>
            <label htmlFor="cm" className="text-lg font-extrabold">Contract comments <span className="text-[13px] font-medium text-[#5B5F66]">(optional)</span></label>
            <textarea id="cm" rows={3} value={comments} onChange={(e) => setComments(e.target.value)} maxLength={2000}
              className="w-full rounded-[10px] border border-[#CFD1D6] p-3 text-[15px] font-medium outline-none focus:border-[#C8173F] focus:ring-4 focus:ring-[#C8173F]/10" />
          </section>
        </div>

        <aside className="flex min-w-0 max-w-[400px] flex-[1_1_320px] flex-col gap-5 lg:sticky lg:top-6">
          <section className="flex flex-col gap-[18px] rounded-[18px] bg-[#111214] p-6 text-white">
            <div>
              <div className="text-[13px] font-semibold text-[#C9CBD0]">Total contract value</div>
              <div className="text-[40px] font-extrabold leading-tight tracking-tight tabular-nums">{money(tcv)}</div>
              <div className="text-[13px] text-[#C9CBD0]">{money(rmrN)} × {termN} months + {money(installN)} install</div>
            </div>
            <div className="h-px bg-[#3A3D42]" />
            <div>
              <div className="text-[13px] font-semibold text-[#C9CBD0]">Points on this card</div>
              <div className="text-[40px] font-extrabold leading-tight tracking-tight">{points.total}</div>
              <div className="text-[13px] leading-relaxed text-[#C9CBD0]">
                {termN < 12 && termN >= 0 && points.lines.length > 0 ? "Contracts under 12 months do not count." : points.lines.length === 0 ? "No points yet." :
                  points.lines.map((l) => <span key={l.label} className="block">{l.label} +{l.points}{l.note ? ` (${l.note})` : ""}</span>)}
              </div>
            </div>
          </section>

          {type === "new_logo" && (
          <section className={`${ui.card} flex flex-col gap-3.5 p-6`}>
            <h2 className="text-lg font-extrabold">New logo check</h2>
            <ul className="flex flex-col gap-3">
              {checks.map((c) => (
                <li key={c.label} className="flex items-start gap-2.5">
                  <span className={`flex size-6 shrink-0 items-center justify-center rounded-full ${c.ok ? "bg-[#DDF3E6]" : "bg-[#FFE9B8]"}`}>
                    {c.ok
                      ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0B6B3A" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7" /></svg>
                      : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7A4B00" strokeWidth="3.2" strokeLinecap="round" aria-hidden><path d="M12 6v8M12 18v.5" /></svg>}
                  </span>
                  <span className="text-sm leading-snug"><span className="font-bold">{c.label}</span><br /><span className="text-[13px] text-[#5B5F66]">{c.detail}</span></span>
                </li>
              ))}
            </ul>
          </section>
          )}

          {!readOnly && (
            <section className="flex flex-col gap-2.5">
              {message && (
                <p role={message.kind === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm font-semibold ${message.kind === "error" ? "bg-[#FBE7EC] text-[#9E1031]" : "bg-[#E3F4E8] text-[#1F7A3D]"}`}>{message.text}</p>
              )}
              {submitted ? (
                <button type="button" onClick={() => void saveDraft()} disabled={busy !== null} className="h-[54px] cursor-pointer rounded-[14px] bg-[#C8173F] text-base font-extrabold text-white hover:bg-[#9E1031] disabled:opacity-60">
                  {busy === "save" ? "Saving…" : "Save changes"}
                </button>
              ) : (
                <>
                  <button type="button" onClick={attemptSubmit} disabled={busy !== null} className="h-[54px] cursor-pointer rounded-[14px] bg-[#C8173F] text-base font-extrabold text-white hover:bg-[#9E1031] disabled:opacity-60">
                    {busy === "submit" ? "Submitting…" : "Submit tally card"}
                  </button>
                  <button type="button" onClick={() => void saveDraft()} disabled={busy !== null} className="h-[50px] cursor-pointer rounded-[14px] border border-[#111214] bg-white text-[15px] font-bold hover:bg-[#F5F5F6] disabled:opacity-60">
                    {busy === "save" ? "Saving…" : "Save draft"}
                  </button>
                </>
              )}
              <p className="text-center text-xs text-[#5B5F66]">You can edit this card until {monthName(month)} is locked.</p>
              {cardId && (
                <button type="button" onClick={() => setDialog("delete")} disabled={busy !== null} className="cursor-pointer text-[13px] font-semibold text-[#C8173F] hover:underline">Delete this card</button>
              )}
            </section>
          )}
        </aside>
      </fieldset>

      <WarningDialog open={dialog === "similar"} title="Check this new logo"
        secondary="Not a new logo" primary="Yes, it is a new logo"
        onSecondary={() => { setType("existing"); nextStep(); }} onPrimary={nextStep}>
        You have sold to a similar customer before: {similar[0]?.name} (first sold {similar[0] ? monthName(similar[0].firstSale, true) : ""}). Please verify this is a new logo. It will also be checked in audit.
      </WarningDialog>
      <WarningDialog open={dialog === "short"} title="Contracts under 12 months do not count"
        secondary="Go back and fix" primary="Save anyway"
        onSecondary={() => { setDialog(null); setQueue([]); termInput.current?.focus(); }} onPrimary={nextStep}>
        This card will be saved but will not count in any category. Check that the term was entered correctly.
      </WarningDialog>
      <WarningDialog open={dialog === "residential"} title="Residential sales need points"
        secondary="Add products" primary="Save anyway"
        onSecondary={() => { setDialog(null); setQueue([]); }} onPrimary={nextStep}>
        Residential sales only count toward Sonitrol points, and this card has none. Add a qualifying product or save as is.
      </WarningDialog>
      <WarningDialog open={dialog === "pdf"} title="Only PDF files can be uploaded"
        secondary="Cancel" primary="Got it" onSecondary={() => setDialog(null)} onPrimary={() => setDialog(null)}>
        Convert the file to a PDF and add it again. You can attach as many PDFs as you need.
      </WarningDialog>
      <WarningDialog open={dialog === "saved"} tone="success" title="Tally card submitted"
        secondary="Back to tally cards" primary="Add another tally card"
        onSecondary={() => router.push(`/cards?month=${month}`)}
        // A full page load on purpose: the address bar was changed behind the router's back after the first save, so a router push would keep this card's form state.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        onPrimary={() => window.location.assign(`/cards/new?month=${month}`)}>
        {name.trim() || "The card"} was saved{points.total > 0 ? ` with ${points.total} Sonitrol ${points.total === 1 ? "point" : "points"}` : ""}. Would you like to enter another one?
      </WarningDialog>
      <WarningDialog open={dialog === "delete"} title="Delete this tally card?"
        secondary="Keep it" primary="Delete card" onSecondary={() => setDialog(null)} onPrimary={() => void confirmDelete()}>
        The card stops counting right away. A record of the deletion is kept in the audit log.
      </WarningDialog>
    </>
  );
}
