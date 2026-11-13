import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Pill, ui } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { TYPE_LABELS, money, newLogoChecks, type CustomerType } from "@/lib/cards";
import { markAlertsRead } from "./actions";
import { MonthControls } from "./month-controls";
import { PdfViewer } from "./pdf-viewer";
import { ReviewPanel, RuleChecks } from "./review-panel";

export const instant = false;

type AuditMonth = { month_start: string; status: "open" | "in_audit" | "finalized"; audit_started_at: string | null; finalized_at: string | null; cards: number; flagged: number; reviewed: number; on_hold: number };
type QueueRow = {
  card_id: string; business_name: string; rep_name: string; dealership: string; sale_date: string; entry_month: string;
  customer_type: CustomerType; addendum: boolean; points: number; is_new_logo: boolean; reasons: string[]; audit_status: "unreviewed" | "approved" | "adjusted" | "on_hold"; notes: string | null;
};

const REASONS: Record<string, { filter: string; tag: string }> = {
  new_logo: { filter: "New logos", tag: "New logo" },
  name_match: { filter: "Name matches", tag: "Name match" },
  failed_checks: { filter: "Failed checks", tag: "Failed checks" },
  late_entry: { filter: "Late entries", tag: "Late entry" },
  under_12: { filter: "Under 12 months", tag: "Under 12 months" },
  residential: { filter: "Residential", tag: "Residential" },
  missing_pdf: { filter: "Missing PDFs", tag: "Missing PDF" },
};
const STATUS_LABEL = { unreviewed: "Unreviewed", approved: "Approved", adjusted: "Adjusted", on_hold: "Waiting for information" } as const;

const NY = "America/New_York";
const monthName = (iso: string, year = false) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const stamp = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: NY });

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ month?: string; filter?: string; card?: string }> }) {
  const profile = await requireSuperAdmin();
  const { month: monthParam, filter = "all", card: cardParam } = await searchParams;
  const supabase = await createClient();

  const [{ data: monthRows }, { data: alertRows }] = await Promise.all([
    supabase.rpc("audit_months"),
    supabase.from("alerts").select("id, message, card_id, created_at").is("read_at", null).order("created_at", { ascending: false }).limit(20),
  ]);
  const all = ((monthRows ?? []) as AuditMonth[]);
  const firstFinalized = all.find((m) => m.status === "finalized");
  const shown = all.filter((m) => m.status !== "finalized" || m === firstFinalized).sort((a, b) => a.month_start.localeCompare(b.month_start));

  // Which month is on screen: the one asked for, the one a card belongs to, the one in audit, or the oldest open one.
  let cardMonth: string | undefined;
  if (cardParam && /^[0-9a-f-]{36}$/i.test(cardParam)) {
    const { data } = await supabase.from("tally_cards").select("entry_month").eq("id", cardParam).maybeSingle();
    cardMonth = data?.entry_month;
  }
  const month = all.find((m) => m.month_start === (monthParam ?? cardMonth))
    ?? shown.find((m) => m.status === "in_audit") ?? shown.find((m) => m.status === "open") ?? shown[shown.length - 1];

  const { data: queueData } = month ? await supabase.rpc("audit_queue", { p_month: month.month_start }) : { data: [] };
  const queue = (queueData ?? []) as QueueRow[];
  const visible = filter === "all" ? queue : filter === "waiting" ? queue.filter((q) => q.audit_status === "on_hold") : filter === "untagged" ? queue.filter((q) => q.reasons.length === 0) : queue.filter((q) => q.reasons.includes(filter));
  const selected = visible.find((q) => q.card_id === cardParam) ?? visible.find((q) => q.audit_status === "unreviewed") ?? visible[0];

  const base = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(month ? { month: month.month_start } : {}), ...(filter !== "all" ? { filter } : {}), ...extra });
    return `/audit?${p.toString()}`;
  };
  const idx = selected ? visible.indexOf(selected) : -1;
  const nextRow = idx >= 0 ? (visible.slice(idx + 1).find((q) => q.audit_status === "unreviewed") ?? visible[idx + 1]) : undefined;
  const nextHref = nextRow ? base({ card: nextRow.card_id }) : base({});

  // The selected card in full: facts, files, why it does or does not count as a new logo, and its history.
  let detail: Awaited<ReturnType<typeof loadDetail>> | null = null;
  if (selected) {
    detail = await loadDetail(supabase, selected.card_id);
    if (!detail) notFound();
  }

  // Reminder about the audit window (work starts on the 11th for the previous month).
  const today = Number(new Date().toLocaleDateString("en-US", { day: "numeric", timeZone: NY }));
  const earliestOpen = shown.find((m) => m.status === "open");
  const reminder = earliestOpen && !all.some((m) => m.status === "in_audit")
    ? (today >= 11 && earliestOpen.month_start < new Date().toISOString().slice(0, 7) + "-01" ? `${monthName(earliestOpen.month_start)} is ready to audit.`
      : today >= 8 && today < 11 && earliestOpen.month_start < new Date().toISOString().slice(0, 7) + "-01" ? `Audit work for ${monthName(earliestOpen.month_start)} starts on the 11th.` : null)
    : null;

  return (
    <AppShell profile={profile}>
      <main className="mx-auto flex max-w-[1376px] flex-col gap-6 px-4 py-8 sm:px-8">
        <div className="flex flex-wrap items-baseline gap-3.5">
          <h1 className="text-[30px] font-extrabold tracking-tight">Audit</h1>
          <span className="text-sm text-[#5B5F66]">Month controls apply to every dealership at once.</span>
        </div>

        {reminder && <p className="rounded-xl bg-[#FFF4DC] px-4 py-3 text-sm font-semibold text-[#7A4B00]">{reminder}</p>}

        {(alertRows ?? []).length > 0 && (
          <section className={`${ui.card} flex flex-col gap-3 p-5`} aria-label="Late sale alerts">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[17px] font-extrabold">Late sales ({alertRows!.length})</h2>
              <form action={markAlertsRead}><button className={ui.secondary}>Mark all as read</button></form>
            </div>
            <ul className="flex flex-col gap-2">
              {alertRows!.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{a.message}</span>
                  {a.card_id && <Link href={`/audit?card=${a.card_id}`} className="font-bold !text-[#C8173F] hover:underline">Review</Link>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-wrap gap-4">
          {shown.map((m) => {
            const dark = m.status === "in_audit";
            const on = m.month_start === month?.month_start;
            const pct = m.flagged === 0 ? 100 : Math.round((m.reviewed / m.flagged) * 100);
            const blocked = all.some((x) => x.month_start < m.month_start && x.status === "open");
            return (
              <article key={m.month_start} className={`flex min-w-0 flex-[1_1_240px] flex-col gap-2.5 rounded-[18px] border p-5 ${dark ? "border-[#111214] bg-[#111214] text-white" : "border-[#E6E7EA] bg-white"} ${on && !dark ? "ring-2 ring-[#111214]" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xl font-extrabold"><Link href={`/audit?month=${m.month_start}`} className={dark ? "!text-white" : "!text-[#111214]"}>{monthName(m.month_start)}</Link></h2>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${dark ? "bg-[#C8173F] text-white" : m.status === "finalized" ? "bg-[#E3F4E8] text-[#1F7A3D]" : "bg-[#EEEFF1] text-[#111214]"}`}>
                    {m.status === "in_audit" ? "In audit" : m.status === "finalized" ? "Finalized" : "Open"}
                  </span>
                </div>
                <div className={`text-[13px] ${dark ? "text-[#C9CBD0]" : "text-[#5B5F66]"}`}>
                  {m.status === "open" && "Dealerships can enter and edit cards."}
                  {m.status === "in_audit" && `Entry locked for all dealerships since ${m.audit_started_at ? new Date(m.audit_started_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: NY }) : "the audit started"}. Only you can edit.`}
                  {m.status === "finalized" && `Locked for everyone${m.finalized_at ? ` since ${new Date(m.finalized_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: NY })}` : ""}.`}
                  {" "}{m.cards} {m.cards === 1 ? "card" : "cards"}.
                </div>
                {m.status === "in_audit" && (
                  <div className="flex flex-col gap-2.5">
                    <div className="h-2 overflow-hidden rounded bg-[#3A3D42]"><div className="h-full bg-white" style={{ width: `${pct}%` }} /></div>
                    <div className="text-[13px] text-[#C9CBD0]">{m.reviewed} of {m.flagged} cards audited{m.on_hold > 0 ? ` · ${m.on_hold} waiting for information` : ""}</div>
                    <div className="flex flex-wrap gap-2"><MonthControls month={m.month_start} name={monthName(m.month_start)} kind="finalize" unreviewed={m.flagged - m.reviewed} dark />
                      {!all.some((x) => x.month_start > m.month_start && x.status !== "open") && (
                        <MonthControls month={m.month_start} name={monthName(m.month_start)} kind="cancel" unreviewed={0} dark />
                      )}
                    </div>
                  </div>
                )}
                {m.status === "open" && !blocked && (
                  <div className="flex flex-wrap gap-2"><MonthControls month={m.month_start} name={monthName(m.month_start)} kind="start" unreviewed={0} /></div>
                )}
                {m.status === "finalized" && (
                  <div className="flex flex-wrap gap-2"><MonthControls month={m.month_start} name={monthName(m.month_start)} kind="reopen" unreviewed={0} />
                    <a href={`/audit/leaders/${m.month_start}`} className="inline-flex h-[42px] items-center rounded-[10px] border border-[#111214] bg-white px-4 text-sm font-bold !text-[#111214] hover:bg-[#F5F5F6]">Export leaders</a>
                  </div>
                )}
              </article>
            );
          })}
        </section>

        {month && (
          <section className="flex flex-wrap items-start gap-5">
            <aside className={`${ui.card} flex min-w-0 max-w-[340px] flex-[1_1_300px] flex-col gap-3.5 p-[18px]`}>
              <h2 className="text-[17px] font-extrabold">Cards to audit · {monthName(month.month_start)}</h2>
              <div className="flex flex-wrap gap-1.5">
                {[["all", "All"], ["waiting", "Waiting for information"], ["untagged", "No tags"], ...Object.entries(REASONS).map(([k, v]) => [k, v.filter])].map(([k, label]) => (
                  <Link key={k} href={`/audit?month=${month.month_start}${k === "all" ? "" : `&filter=${k}`}`} aria-current={filter === k ? "true" : undefined}
                    className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold ${filter === k ? "border-[#111214] bg-[#111214] !text-white" : "border-[#CFD1D6] bg-white !text-[#3A3D42] hover:border-[#111214]"}`}>
                    {label}{k === "all" ? ` (${queue.length})` : k === "waiting" ? ` (${queue.filter((q) => q.audit_status === "on_hold").length})` : k === "untagged" ? ` (${queue.filter((q) => q.reasons.length === 0).length})` : ` (${queue.filter((q) => q.reasons.includes(k)).length})`}
                  </Link>
                ))}
              </div>
              {visible.length === 0 ? (
                <p className="py-6 text-center text-sm text-[#5B5F66]">Nothing to audit here.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {visible.map((q) => (
                    <li key={q.card_id}>
                      <Link href={base({ card: q.card_id })} aria-current={q.card_id === selected?.card_id ? "true" : undefined}
                        className={`flex flex-col gap-1.5 rounded-[14px] border-2 px-3.5 py-3 !text-[#111214] ${q.card_id === selected?.card_id ? "border-[#111214] bg-white" : "border-[#E6E7EA] bg-[#FAFAFB] hover:border-[#B8BBC2]"}`}>
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-bold">{q.business_name}</span>
                          <span className={`whitespace-nowrap text-xs ${q.audit_status === "unreviewed" ? "text-[#5B5F66]" : q.audit_status === "approved" ? "font-bold text-[#1F7A3D]" : q.audit_status === "on_hold" ? "font-bold text-[#9E1031]" : "font-bold text-[#7A4B00]"}`}>{q.audit_status === "on_hold" ? "Waiting" : STATUS_LABEL[q.audit_status]}</span>
                        </span>
                        <span className="text-xs text-[#5B5F66]">{q.rep_name} · {q.dealership}</span>
                        <span className="flex flex-wrap gap-1.5">
                          {q.reasons.map((r) => <span key={r} className="rounded-md bg-[#F0F0F2] px-[7px] py-[3px] text-[11px] font-bold">{REASONS[r]?.tag ?? r}</span>)}
                        </span>
                        {q.notes && <span className="line-clamp-2 text-xs italic text-[#5B5F66]">“{q.notes}”</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </aside>

            {selected && detail ? (
              <>
                <section className="flex min-w-0 flex-[2_1_430px] flex-col gap-4">
                  <div className={`${ui.card} flex flex-col gap-[18px] p-6`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-2xl font-extrabold tracking-tight">{detail.card.business_name}</h2>
                        <div className="mt-0.5 text-sm text-[#5B5F66]">
                          {detail.rep} · {detail.dealership}{detail.card.contract_number ? ` · contract ${detail.card.contract_number}` : ""} · sold {shortDate(detail.card.sale_date)} · entered in {monthName(detail.card.entry_month)}
                        </div>
                      </div>
                      <span className="flex flex-wrap gap-1.5">
                        <Pill tone={detail.card.customer_type === "new_logo" ? "dark" : "light"}>{TYPE_LABELS[detail.card.customer_type as CustomerType]}{detail.card.addendum ? " · addendum" : ""}</Pill>
                        {selected.reasons.filter((r) => r !== "new_logo" && r !== "residential").map((r) => <Pill key={r} tone="amber">{REASONS[r]?.tag ?? r}</Pill>)}
                        <Pill tone={selected.audit_status === "approved" ? "green" : selected.audit_status === "adjusted" || selected.audit_status === "on_hold" ? "amber" : "outline"}>{STATUS_LABEL[selected.audit_status]}</Pill>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {[["RMR", money(Number(detail.card.rmr_amount))], ["Install", money(Number(detail.card.install_amount))], ["Term", `${detail.card.term_months} mo`], ["TCV", money(Number(detail.card.tcv))], ["Points", String(detail.card.points)]].map(([l, v]) => (
                        <div key={l} className="min-w-[110px] flex-1 rounded-xl bg-[#F5F5F6] px-3.5 py-3">
                          <div className="text-xs font-semibold text-[#5B5F66]">{l}</div>
                          <div className="text-xl font-extrabold tabular-nums">{v}</div>
                        </div>
                      ))}
                    </div>
                    {detail.products.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 text-[13px]">
                        {detail.products.map((p) => <span key={p} className="rounded-full border border-[#E6E7EA] px-3 py-1 font-semibold">{p}</span>)}
                      </div>
                    )}
                    <div className="flex flex-col gap-3 rounded-[14px] border border-[#E6E7EA] p-4">
                      <div>
                        <div className="text-[13px] font-semibold text-[#5B5F66]">Why the rules say {detail.card.is_new_logo ? "this is" : "this is not"} a new logo</div>
                        <div className="mt-2"><RuleChecks checks={detail.checks} /></div>
                      </div>
                      {detail.audit?.reason && (
                        <p className="rounded-lg bg-[#FFF4DC] px-3 py-2 text-sm text-[#7A4B00]"><b>Audit note:</b> {detail.audit.reason}</p>
                      )}
                      <ReviewPanel key={`${selected.card_id}-${detail.card.points}-${detail.card.is_new_logo}-${detail.card.customer_type}-${selected.audit_status}`}
                        cardId={selected.card_id} nextHref={nextHref} locked={month.status === "finalized"}
                        status={selected.audit_status} savedNotes={selected.notes ?? ""}
                        current={{ newLogo: detail.card.is_new_logo, customerType: detail.card.customer_type as CustomerType, points: detail.card.points, overridden: Boolean(detail.audit && (detail.audit.new_logo_override !== null || detail.audit.points_override !== null)) }} />
                    </div>
                  </div>
                  <div className={`${ui.card} flex flex-col gap-2.5 px-6 py-5`}>
                    <h3 className="text-[15px] font-extrabold">Activity</h3>
                    <ul className="flex flex-col gap-2">
                      {detail.activity.map((l, n) => (
                        <li key={n} className="flex gap-3 text-[13px]"><span className="w-[110px] flex-none text-[#5B5F66]">{stamp(l.at)}</span><span><b>{l.who}</b> · {l.what}</span></li>
                      ))}
                      {detail.activity.length === 0 && <li className="text-[13px] text-[#5B5F66]">No activity recorded.</li>}
                    </ul>
                  </div>
                </section>
                <aside className={`${ui.card} min-w-0 flex-[2_1_370px] p-[18px]`}>
                  <PdfViewer key={selected.card_id} files={detail.files} />
                </aside>
              </>
            ) : (
              <p className={`${ui.card} min-w-0 flex-[3_1_520px] p-10 text-center text-sm text-[#5B5F66]`}>
                {queue.length === 0 ? `No submitted cards in ${monthName(month.month_start)} yet.` : "Choose a card from the list."}
              </p>
            )}
          </section>
        )}
      </main>
    </AppShell>
  );
}

async function loadDetail(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data: card } = await supabase
    .from("tally_cards")
    .select("id, business_name, contract_number, sale_date, entry_month, customer_type, addendum, term_months, install_amount, rmr_amount, tcv, points, is_new_logo, dealership_id, reps(first_name, last_name), dealerships(name), tally_card_products(quantity, products(label, qualifies_new_logo)), tally_card_files(id, file_name, size_bytes), card_audit(status, new_logo_override, points_override, reason)")
    .eq("id", id).maybeSingle();
  if (!card) return null;
  const [{ data: similar }, { data: activity }] = await Promise.all([
    supabase.rpc("similar_customers", { p_dealership: card.dealership_id, p_name: card.business_name, p_exclude: id }),
    supabase.rpc("card_activity", { p_card: id }),
  ]);
  const lines = card.tally_card_products as unknown as { quantity: number; products: { label: string; qualifies_new_logo: boolean } }[];
  const qualifying = lines.filter((l) => l.products.qualifies_new_logo && l.quantity > 0).map((l) => l.products.label.replace(/\s*\(.*\)$/, ""));
  const first = ((similar ?? []) as { business_name: string; first_sale: string }[])[0];
  const audit = (Array.isArray(card.card_audit) ? card.card_audit[0] : card.card_audit) as { status: string; new_logo_override: boolean | null; points_override: number | null; reason: string | null } | null;
  const rep = card.reps as unknown as { first_name: string; last_name: string };
  return {
    card, audit,
    rep: `${rep.first_name} ${rep.last_name}`,
    dealership: (card.dealerships as unknown as { name: string }).name,
    products: lines.filter((l) => l.quantity > 0).map((l) => `${l.products.label.replace(/\s*\(.*\)$/, "")}${l.quantity > 1 ? ` × ${l.quantity}` : ""}`),
    files: card.tally_card_files as { id: string; file_name: string }[],
    checks: newLogoChecks({
      type: card.customer_type as CustomerType, addendum: card.addendum, qualifying,
      rmr: Number(card.rmr_amount), install: Number(card.install_amount), term: card.term_months,
      similar: first ? `${first.business_name}, first sold ${new Date(`${first.first_sale}T00:00:00Z`).getUTCFullYear()}` : null,
    }),
    activity: ((activity ?? []) as { at: string; who: string; what: string }[]),
  };
}
