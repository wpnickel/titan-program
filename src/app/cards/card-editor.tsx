import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CustomerType, RepOption } from "@/lib/cards";
import { CardForm } from "./card-form";
import { loadFormLists } from "./load";

/** The tally card form for an existing card, loaded for the person looking at it. Used by the card page and the audit popup. */
export async function CardEditor({ id, embedded }: { id: string; embedded?: boolean }) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();

  const [{ data: card }, lists, { data: editable }] = await Promise.all([
    supabase
      .from("tally_cards")
      .select("id, rep_id, entry_month, sale_date, business_name, zip_code, industry_id, customer_type, addendum, contract_number, term_months, install_amount, rmr_amount, comments, submitted, dealership_id, reps(first_name, last_name), dealerships(name), tally_card_products(product_id, quantity), tally_card_lead_sources(lead_source_id), tally_card_files(id, file_name, size_bytes)")
      .eq("id", id).is("deleted_at", null).maybeSingle(),
    loadFormLists(),
    supabase.rpc("can_edit_card", { p_card: id }),
  ]);
  if (!card) notFound();

  // A card the person cannot change is shown read-only, with its own rep and month so the page still makes sense.
  const rep = card.reps as unknown as { first_name: string; last_name: string };
  const dealership = (card.dealerships as unknown as { name: string }).name;
  const reps: RepOption[] = lists.reps.some((r) => r.id === card.rep_id)
    ? lists.reps
    : [...lists.reps, { id: card.rep_id, name: `${rep.first_name} ${rep.last_name}`, dealership_id: card.dealership_id, dealership }];
  const months = lists.months.includes(card.entry_month) ? lists.months : [card.entry_month, ...lists.months];

  const money = (n: number) => (n ? String(Number(n)) : "");
  return (
      <CardForm
        embedded={embedded}
        {...lists}
        reps={reps}
        months={months}
        readOnlyReason={editable ? undefined : "You can view this card but not change it. It may belong to someone else, or its month is closed for changes."}
        initial={{
          id: card.id, submitted: card.submitted, rep_id: card.rep_id, entry_month: card.entry_month, sale_date: card.sale_date,
          business_name: card.business_name, zip_code: card.zip_code ?? "", industry_id: card.industry_id ?? "",
          customer_type: card.customer_type as CustomerType, addendum: card.addendum, contract_number: card.contract_number ?? "",
          term_months: card.term_months ? String(card.term_months) : "", install_amount: money(card.install_amount),
          rmr_amount: money(card.rmr_amount), comments: card.comments ?? "",
          quantities: Object.fromEntries(card.tally_card_products.map((p) => [p.product_id, p.quantity])),
          lead_source_ids: card.tally_card_lead_sources.map((s) => s.lead_source_id),
          files: card.tally_card_files,
        }}
      />
  );
}
