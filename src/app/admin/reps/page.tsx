import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Avatar, Chevron, Field, Pill, Switch, ui } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { addRep, saveRep } from "./actions";

export const instant = false;

export default async function RepsPage({ searchParams }: { searchParams: Promise<{ dealership?: string; inactive?: string }> }) {
  const { dealership, inactive } = await searchParams;
  const supabase = await createClient();
  const { data: dealerships } = await supabase.from("dealerships").select("id, name").eq("active", true).order("name");
  const nameById = new Map((dealerships ?? []).map((d) => [d.id, d.name]));

  let query = supabase.from("reps").select("id, first_name, last_name, dealership_id, active").order("last_name").order("first_name");
  if (dealership) query = query.eq("dealership_id", dealership);
  if (inactive !== "1") query = query.eq("active", true);
  const { data } = await query;
  const reps = data ?? [];

  const options = (dealerships ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>);

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-2xl text-sm text-[#5B5F66]">
        Reps are the people who compete. They are separate from logins, so a rep keeps their history if their role or dealership changes.
      </p>

      <details className="group flex flex-col gap-3">
        <summary className="flex list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span className="text-sm text-[#5B5F66]">{reps.length} {reps.length === 1 ? "rep" : "reps"}</span>
          <span className={ui.primary}>+ Add rep</span>
        </summary>
        <div className={`${ui.card} p-5`}>
          <ActionForm action={addRep} className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="First name"><input name="first_name" required className={ui.input} /></Field>
              <Field label="Last name"><input name="last_name" required className={ui.input} /></Field>
              <Field label="Dealership">
                <select name="dealership_id" required defaultValue={dealership ?? ""} className={ui.input}>
                  <option value="" disabled>Choose a dealership</option>
                  {options}
                </select>
              </Field>
            </div>
            <div><button className={ui.primary}>Add rep</button></div>
          </ActionForm>
        </div>
      </details>

      <form method="get" className={`${ui.card} flex flex-wrap items-center gap-3 p-4`}>
        <select name="dealership" defaultValue={dealership ?? ""} aria-label="Dealership filter" className={`${ui.input} w-auto min-w-56 flex-1`}>
          <option value="">All dealerships</option>
          {options}
        </select>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="inactive" value="1" defaultChecked={inactive === "1"} className="size-4 accent-[#111214]" /> Show inactive
        </label>
        <button className={ui.secondary}>Apply</button>
        <Link href="/admin/reps" className="text-sm font-semibold text-[#C8173F]">Clear</Link>
      </form>

      <ul className="flex flex-col gap-2">
        {reps.map((r) => (
          <li key={r.id}>
            <details className={`group ${ui.card} open:shadow-[0_2px_12px_rgba(17,18,20,0.06)]`}>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3.5 p-4 [&::-webkit-details-marker]:hidden">
                <Avatar text={`${r.first_name} ${r.last_name}`} />
                <span className="min-w-0 flex-1 basis-48">
                  <span className={`block text-[15px] font-bold ${r.active ? "" : "text-[#8E929A]"}`}>{r.first_name} {r.last_name}</span>
                  <span className="block text-[13px] text-[#5B5F66]">{nameById.get(r.dealership_id) ?? "Inactive dealership"}</span>
                </span>
                {!r.active && <Pill tone="outline">Inactive</Pill>}
                <Chevron />
              </summary>
              <div className="border-t border-[#EEEFF1] p-5">
                <ActionForm action={saveRep} className="flex flex-col gap-4">
                  <input type="hidden" name="id" value={r.id} />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="First name"><input name="first_name" defaultValue={r.first_name} required className={ui.input} /></Field>
                    <Field label="Last name"><input name="last_name" defaultValue={r.last_name} required className={ui.input} /></Field>
                    <Field label="Dealership">
                      <select name="dealership_id" defaultValue={r.dealership_id} className={ui.input}>{options}</select>
                    </Field>
                  </div>
                  <Switch name="active" label="Active" note="Inactive reps keep their history but no longer appear in new entries." defaultChecked={r.active} />
                  <div><button className={ui.dark}>Save changes</button></div>
                </ActionForm>
              </div>
            </details>
          </li>
        ))}
        {reps.length === 0 && <li className={`${ui.card} p-8 text-center text-sm text-[#5B5F66]`}>No reps to show.</li>}
      </ul>
    </div>
  );
}
