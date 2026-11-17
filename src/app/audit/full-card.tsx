import type { ReactNode } from "react";
import { Pill } from "@/components/ui";
import { TYPE_LABELS, UPLOAD_TCV, money, needsUpload, previewPoints, type CustomerType } from "@/lib/cards";
import { EditCardButton } from "./edit-card";
import { ViewPdfButton } from "./pdf-dialog";
import { REASONS } from "./audit-types";

export type FullCardData = {
  business_name: string; rep: string; dealership: string; zip_code: string | null; industry: string | null; leadSources: string[];
  customer_type: CustomerType; addendum: boolean; contract_number: string | null; sale_date: string; entry_month: string; is_late_entry: boolean;
  term_months: number; install_amount: number; rmr_amount: number; tcv: number; points: number; comments: string | null;
  products: { id: string; key: string; label: string; points: number; qualifies_new_logo: boolean; needs_audio_sensor: boolean; quantity: number }[];
  files: { id: string; file_name: string; size_bytes: number }[];
};

const fmtDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const monthLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const fileSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-[#E6E7EA] px-5 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-extrabold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children, warn }: { label: string; children: ReactNode; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold text-[#5B5F66]">{label}</div>
      <div className={`mt-0.5 break-words text-sm font-bold ${warn ? "text-[#9E1031]" : ""}`}>{children}</div>
    </div>
  );
}

const blank = <span className="font-medium text-[#8E929A]">Not entered</span>;

/** The whole tally card, read-only, in the same order as the entry form, so every part can be audited in one place. */
export function FullCard({ card, tags }: { card: FullCardData; tags: string[] }) {
  const qty = Object.fromEntries(card.products.map((p) => [p.id, p.quantity]));
  const calc = previewPoints(card.products, qty, card.term_months);
  const hasAudio = card.products.some((p) => p.key === "audio_sensor");
  const needsPdf = needsUpload(card.customer_type, card.tcv);
  const shownTags = tags.filter((t) => t !== "new_logo" && t !== "residential" && t !== "late_entry" && t !== "missing_pdf" && t !== "under_12");

  return (
    <article aria-label="Tally card" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-[18px] border border-[#E6E7EA] bg-white">
      <header className="sticky top-0 z-10 flex flex-wrap items-start justify-between gap-3 bg-white px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold tracking-tight">{card.business_name}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-[#5B5F66]">
            <Pill tone={card.customer_type === "new_logo" ? "dark" : "light"}>{TYPE_LABELS[card.customer_type]}{card.addendum ? " · addendum" : ""}</Pill>
            {card.is_late_entry && <Pill tone="crimson">Late entry</Pill>}
            {shownTags.map((t) => <Pill key={t} tone="amber">{REASONS[t]?.tag ?? t}</Pill>)}
          </div>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          {card.files.length > 0
            ? <ViewPdfButton>View PDF{card.files.length > 1 ? `s (${card.files.length})` : ""} <span className="rounded-md bg-white/25 px-1.5 py-0.5 text-[11px] font-bold">P</span></ViewPdfButton>
            : <span className={`inline-flex h-9 items-center rounded-[10px] px-3 text-[13px] font-bold ${needsPdf ? "bg-[#FFF4DC] text-[#7A4B00]" : "bg-[#F0F0F2] text-[#5B5F66]"}`}>No PDF attached</span>}
          <EditCardButton />
        </span>
      </header>

      <Section title="Customer">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-5 gap-y-3">
          <Field label="Salesperson">{card.rep}</Field>
          <Field label="Dealership">{card.dealership}</Field>
          <Field label="Customer type">{TYPE_LABELS[card.customer_type]}</Field>
          <Field label="ZIP code">{card.zip_code || blank}</Field>
          <Field label="Industry">{card.industry || blank}</Field>
          <Field label="Entered in">{monthLabel(card.entry_month)}</Field>
        </div>
        <div>
          <div className="text-xs font-semibold text-[#5B5F66]">Lead source</div>
          {card.leadSources.length > 0
            ? <div className="mt-1.5 flex flex-wrap gap-1.5">{card.leadSources.map((s) => <span key={s} className="rounded-full border border-[#111214] px-3 py-1 text-[13px] font-bold">{s}</span>)}</div>
            : <div className="mt-0.5 text-[15px]">{blank}</div>}
        </div>
      </Section>

      <Section title="Contract">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-5 gap-y-3">
          <Field label="Contract number">{card.contract_number || blank}</Field>
          <Field label="Date of sale" warn={card.is_late_entry}>{fmtDate(card.sale_date)}{card.is_late_entry && <span className="block text-xs font-semibold">Before {monthLabel(card.entry_month)}: late entry</span>}</Field>
          <Field label="Addendum">{card.addendum ? "Yes" : "No"}</Field>
          <Field label="Term" warn={card.term_months < 12}>{card.term_months} months{card.term_months < 12 && <span className="block text-xs font-semibold">Under 12 months does not count</span>}</Field>
          <Field label="Installation">{money(Number(card.install_amount))}</Field>
          <Field label="RMR">{money(Number(card.rmr_amount))}</Field>
          <Field label="TCV (calculated)">{money(Number(card.tcv))}</Field>
        </div>
      </Section>

      <Section title="Products sold" aside={<span className="text-[13px] text-[#5B5F66]">Points count once per card, not per unit.</span>}>
        {card.products.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2.5">
            {card.products.map((p) => {
              const missingAudio = p.needs_audio_sensor && !hasAudio;
              const counts = p.points > 0 && !missingAudio;
              return (
                <div key={p.id} className="flex min-w-0 flex-col gap-1.5 rounded-[14px] border-2 border-[#111214] bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-bold">{p.label.replace(/\s*\(.*\)$/, "")}</span>
                    <span className="shrink-0 rounded-full bg-[#111214] px-2 py-0.5 text-xs font-bold text-white">× {p.quantity}</span>
                  </div>
                  <span className={`w-fit whitespace-nowrap rounded-full px-[9px] py-[3px] text-xs font-bold ${counts ? "bg-[#FBE3E9] text-[#9E1031]" : "bg-[#F0F0F2] text-[#5B5F66]"}`}>
                    {counts ? `${p.points} ${p.points === 1 ? "pt" : "pts"}` : "No points"}
                  </span>
                  {missingAudio && <span className="text-xs font-semibold text-[#7A4B00]">Needs an audio sensor on the card</span>}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg bg-[#FBE7EC] px-3 py-2 text-sm font-semibold text-[#9E1031]">No products are marked as sold on this card.</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F5F5F6] px-3.5 py-2.5 text-sm">
          <span><b>{calc.total}</b> {calc.total === 1 ? "point" : "points"} from the products{card.term_months < 12 ? " (under 12 months, so none count)" : ""}</span>
          {card.points !== calc.total && <span className="font-bold text-[#7A4B00]">Points on the card: {card.points} (changed from the calculation)</span>}
        </div>
      </Section>

      <Section title="Supporting documents"
        aside={needsPdf
          ? <span className="rounded-full bg-[#FFF4DC] px-2.5 py-1 text-xs font-semibold text-[#7A4B00]">Required for this card</span>
          : <span className="text-[13px] text-[#5B5F66]">Required for new logos, residential, and contracts of {money(UPLOAD_TCV)} or more</span>}>
        {card.files.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {card.files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 rounded-xl border border-[#E6E7EA] px-3.5 py-2.5">
                <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-[#111214] text-[11px] font-extrabold text-white">PDF</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{f.file_name}</span>
                <span className="text-[13px] text-[#5B5F66]">{fileSize(f.size_bytes)}</span>
                <ViewPdfButton fileId={f.id} className="h-8 cursor-pointer rounded-lg border border-[#111214] bg-white px-3 text-[13px] font-bold hover:bg-[#F5F5F6]">View</ViewPdfButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`rounded-lg px-3 py-2 text-sm font-semibold ${needsPdf ? "bg-[#FFF4DC] text-[#7A4B00]" : "bg-[#F5F5F6] text-[#5B5F66]"}`}>
            No PDF is attached to this card.{needsPdf ? " It needs one." : ""}
          </p>
        )}
      </Section>

      <Section title="Comments">
        {card.comments ? <p className="whitespace-pre-wrap text-[15px]">{card.comments}</p> : <p className="text-sm text-[#5B5F66]">No comments on this card.</p>}
      </Section>
    </article>
  );
}
