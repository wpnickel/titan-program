import { ActionForm } from "@/components/action-form";
import { Avatar, Chevron, Field, Pill, Switch, ui } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { addDealership, saveDealership } from "./actions";

export const instant = false;

export default async function DealershipsPage() {
  const { data } = await (await createClient())
    .from("dealerships")
    .select("id, name, is_securitas, salespeople_enter_own_cards, active")
    .order("active", { ascending: false })
    .order("name");
  const dealerships = data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <details className="group flex flex-col gap-3">
        <summary className="flex list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span className="text-sm text-[#5B5F66]">{dealerships.length} {dealerships.length === 1 ? "dealership" : "dealerships"}</span>
          <span className={ui.primary}>+ Add dealership</span>
        </summary>
        <div className={`${ui.card} p-5`}>
            <ActionForm action={addDealership} className="flex flex-col gap-4">
              <Field label="Dealership name"><input name="name" required placeholder="Sonitrol of …" className={ui.input} /></Field>
              <div>
                <Switch name="is_securitas" label="Securitas" note="Eligible for the Securitas spot on the Cronus Trip." />
                <Switch name="salespeople_enter_own_cards" label="Salespeople enter their own cards" note="Lets every rep here enter their own tally cards." />
              </div>
              <button className={ui.primary}>Add dealership</button>
            </ActionForm>
        </div>
      </details>

      <ul className="flex flex-col gap-2">
        {dealerships.map((d) => (
          <li key={d.id}>
            <details className={`group ${ui.card} open:shadow-[0_2px_12px_rgba(17,18,20,0.06)]`}>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3.5 p-4 [&::-webkit-details-marker]:hidden">
                <Avatar text={d.name.replace(/^Sonitrol( of)?\s*/i, "") || d.name} />
                <span className="min-w-0 flex-1 basis-48">
                  <span className={`block text-[15px] font-bold ${d.active ? "" : "text-[#8E929A]"}`}>{d.name}</span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {d.is_securitas && <Pill tone="dark">Securitas</Pill>}
                  {d.salespeople_enter_own_cards && <Pill>Reps enter own cards</Pill>}
                  {!d.active && <Pill tone="outline">Inactive</Pill>}
                </span>
                <Chevron />
              </summary>
              <div className="border-t border-[#EEEFF1] p-5">
                <ActionForm action={saveDealership} className="flex flex-col gap-4">
                  <input type="hidden" name="id" value={d.id} />
                  <Field label="Dealership name"><input name="name" defaultValue={d.name} required className={ui.input} /></Field>
                  <div>
                    <Switch name="is_securitas" label="Securitas" note="Eligible for the Securitas spot on the Cronus Trip." defaultChecked={d.is_securitas} />
                    <Switch name="salespeople_enter_own_cards" label="Salespeople enter their own cards" note="Lets every rep here enter their own tally cards." defaultChecked={d.salespeople_enter_own_cards} />
                    <Switch name="active" label="Active" note="Inactive dealerships keep their history but cannot be used for new entries." defaultChecked={d.active} />
                  </div>
                  <div><button className={ui.dark}>Save changes</button></div>
                </ActionForm>
              </div>
            </details>
          </li>
        ))}
        {dealerships.length === 0 && (
          <li className={`${ui.card} p-8 text-center text-sm text-[#5B5F66]`}>No dealerships yet. Use “Add dealership” to create the first one.</li>
        )}
      </ul>
    </div>
  );
}
