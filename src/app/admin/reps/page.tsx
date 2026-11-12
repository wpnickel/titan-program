import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { createClient } from "@/lib/supabase/server";
import { addRep, saveRep } from "./actions";

export const instant = false;

const input = "rounded-xl border border-[#CFD1D6] px-3 py-2 text-sm";
const save = "rounded-xl bg-[#111214] px-4 py-2 text-sm font-bold text-white";

export default async function RepsPage({ searchParams }: { searchParams: Promise<{ dealership?: string; inactive?: string }> }) {
  const { dealership, inactive } = await searchParams;
  const supabase = await createClient();
  const { data: dealerships } = await supabase.from("dealerships").select("id, name").eq("active", true).order("name");

  let query = supabase.from("reps").select("id, first_name, last_name, dealership_id, active").order("last_name").order("first_name");
  if (dealership) query = query.eq("dealership_id", dealership);
  if (inactive !== "1") query = query.eq("active", true);
  const { data: reps } = await query;

  const options = (dealerships ?? []).map((d) => (
    <option key={d.id} value={d.id}>{d.name}</option>
  ));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-extrabold">Reps</h1>
      <p className="text-sm text-[#5B5F66]">Reps are the people who compete. They are separate from logins, so a rep keeps their history if their role or dealership changes.</p>

      <section className="rounded-2xl border border-[#E6E7EA] bg-white p-5">
        <h2 className="mb-3 text-lg font-extrabold">Add a rep</h2>
        <ActionForm action={addRep} className="flex flex-wrap items-center gap-3">
          <input name="first_name" placeholder="First name" required className={input} />
          <input name="last_name" placeholder="Last name" required className={input} />
          <select name="dealership_id" required defaultValue={dealership ?? ""} className={`${input} min-w-56`}>
            <option value="" disabled>Dealership</option>
            {options}
          </select>
          <button className={save}>Add</button>
        </ActionForm>
      </section>

      <form className="flex flex-wrap items-center gap-3" method="get">
        <select name="dealership" defaultValue={dealership ?? ""} className={`${input} min-w-56`}>
          <option value="">All dealerships</option>
          {options}
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="inactive" value="1" defaultChecked={inactive === "1"} /> Show inactive</label>
        <button className="rounded-xl border border-[#CFD1D6] px-4 py-2 text-sm font-semibold">Filter</button>
        <Link href="/admin/reps" className="text-sm font-semibold text-[#C8173F]">Clear</Link>
      </form>

      <section className="flex flex-col gap-2">
        {(reps ?? []).map((r) => (
          <ActionForm key={r.id} action={saveRep} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#E6E7EA] bg-white p-4">
            <input type="hidden" name="id" value={r.id} />
            <input name="first_name" defaultValue={r.first_name} required className={input} />
            <input name="last_name" defaultValue={r.last_name} required className={input} />
            <select name="dealership_id" defaultValue={r.dealership_id} className={`${input} min-w-56`}>{options}</select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={r.active} /> Active</label>
            <button className={save}>Save</button>
          </ActionForm>
        ))}
        {(reps ?? []).length === 0 && <p className="text-sm text-[#5B5F66]">No reps to show.</p>}
      </section>
    </div>
  );
}
