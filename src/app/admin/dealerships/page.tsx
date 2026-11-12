import { ActionForm } from "@/components/action-form";
import { createClient } from "@/lib/supabase/server";
import { addDealership, saveDealership } from "./actions";

export const instant = false;

const input = "rounded-xl border border-[#CFD1D6] px-3 py-2 text-sm";
const save = "rounded-xl bg-[#111214] px-4 py-2 text-sm font-bold text-white";

export default async function DealershipsPage() {
  const { data: dealerships } = await (await createClient())
    .from("dealerships")
    .select("id, name, is_securitas, salespeople_enter_own_cards, active")
    .order("active", { ascending: false })
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-extrabold">Dealerships</h1>

      <section className="rounded-2xl border border-[#E6E7EA] bg-white p-5">
        <h2 className="mb-3 text-lg font-extrabold">Add a dealership</h2>
        <ActionForm action={addDealership} className="flex flex-wrap items-center gap-3">
          <input name="name" placeholder="Dealership name" required className={`${input} min-w-64 flex-1`} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_securitas" /> Securitas</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="salespeople_enter_own_cards" /> Salespeople enter their own cards</label>
          <button className={save}>Add</button>
        </ActionForm>
      </section>

      <section className="flex flex-col gap-2">
        {(dealerships ?? []).map((d) => (
          <ActionForm key={d.id} action={saveDealership} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#E6E7EA] bg-white p-4">
            <input type="hidden" name="id" value={d.id} />
            <input name="name" defaultValue={d.name} required className={`${input} min-w-64 flex-1`} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_securitas" defaultChecked={d.is_securitas} /> Securitas</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="salespeople_enter_own_cards" defaultChecked={d.salespeople_enter_own_cards} /> Salespeople enter own cards</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={d.active} /> Active</label>
            <button className={save}>Save</button>
          </ActionForm>
        ))}
        {(dealerships ?? []).length === 0 && <p className="text-sm text-[#5B5F66]">No dealerships yet. Add the first one above.</p>}
      </section>
    </div>
  );
}
