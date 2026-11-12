import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Avatar, Chevron, Field, Pill, Switch, ui } from "@/components/ui";
import { saveRep } from "../reps/actions";
import { PRESET_DEFAULTS, PRESET_LABELS, TOGGLE_KEYS, type Preset, type Toggles } from "@/lib/permissions";
import { requireSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ResendInviteForm, UserForm } from "./user-form";

export const instant = false;

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; dealership?: string; inactive?: string }> }) {
  const me = await requireSuperAdmin();
  const { q = "", dealership = "", inactive } = await searchParams;
  const supabase = await createClient();

  const [{ data: dealershipRows }, { data: repRows }, { data: profileRows }, { data: assignRows }, { data: statusRows }] = await Promise.all([
    supabase.from("dealerships").select("id, name, active").order("name"),
    supabase.from("reps").select("id, first_name, last_name, dealership_id, active").order("last_name"),
    supabase.from("profiles").select("*").order("last_name").order("first_name"),
    supabase.from("profile_dealerships").select("profile_id, dealership_id"),
    supabase.from("profile_status").select("profile_id, invited_at, last_login_at"),
  ]);
  const statusById = new Map((statusRows ?? []).map((r) => [r.profile_id as string, r]));

  const dealerships = (dealershipRows ?? []).filter((d) => d.active).map((d) => ({ id: d.id, name: d.name }));
  const nameById = new Map((dealershipRows ?? []).map((d) => [d.id, d.name]));
  const takenBy = new Map((profileRows ?? []).filter((p) => p.rep_id).map((p) => [p.rep_id as string, p.id as string]));
  const reps = (repRows ?? []).filter((r) => r.active).map((r) => ({
    id: r.id, name: `${r.first_name} ${r.last_name}`, dealership_id: r.dealership_id, takenBy: takenBy.get(r.id) ?? null,
  }));

  const assigned = new Map<string, string[]>();
  for (const a of assignRows ?? []) assigned.set(a.profile_id, [...(assigned.get(a.profile_id) ?? []), a.dealership_id]);

  const users = (profileRows ?? [])
    .map((p) => {
      const ids: string[] = p.scope === "assigned" ? assigned.get(p.id) ?? [] : p.dealership_id ? [p.dealership_id] : [];
      const where = p.scope === "all" ? "All dealerships" : ids.map((i) => nameById.get(i) ?? "Inactive dealership").join(", ") || "No dealership";
      const st = statusById.get(p.id);
      const status = st?.last_login_at ? "Active" : st?.invited_at ? "Invited" : "Not invited";
      return { ...p, ids, where, status };
    })
    .filter((u) => (inactive === "1" ? true : u.active))
    .filter((u) => !dealership || u.ids.includes(dealership) || u.scope === "all")
    .filter((u) => !q || `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));

  // Reps with no login yet (never signs in, or imported history) show in the same list.
  const repOnly = (repRows ?? [])
    .filter((r) => !takenBy.has(r.id))
    .filter((r) => (inactive === "1" ? true : r.active))
    .filter((r) => !dealership || r.dealership_id === dealership)
    .filter((r) => !q || `${r.first_name} ${r.last_name}`.toLowerCase().includes(q.toLowerCase()));

  const blank = { preset: "salesperson_enters" as Preset, toggles: PRESET_DEFAULTS.salesperson_enters };

  return (
    <div className="flex flex-col gap-5">
      <details className="group flex flex-col gap-3">
        <summary className="flex list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span className="text-sm text-[#5B5F66]">{users.length + repOnly.length} {users.length + repOnly.length === 1 ? "person" : "people"}</span>
          <span className={ui.primary}>+ Add person</span>
        </summary>
        <div className={`${ui.card} p-5`}>
          <UserForm dealerships={dealerships} reps={reps} initial={blank} />
        </div>
      </details>

      <form method="get" className={`${ui.card} flex flex-wrap items-center gap-3 p-4`}>
        <input name="q" defaultValue={q} placeholder="Search by name or email" aria-label="Search users" className={`${ui.input} min-w-56 flex-1`} />
        <select name="dealership" defaultValue={dealership} aria-label="Dealership filter" className={`${ui.input} w-auto min-w-56`}>
          <option value="">All dealerships</option>
          {dealerships.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="inactive" value="1" defaultChecked={inactive === "1"} className="size-4 accent-[#111214]" /> Show inactive
        </label>
        <button className={ui.secondary}>Apply</button>
        <Link href="/admin/users" className="text-sm font-semibold text-[#C8173F]">Clear</Link>
      </form>

      <ul className="flex flex-col gap-2">
        {users.map((u) => {
          const toggles = Object.fromEntries(TOGGLE_KEYS.map((k) => [k, u[k] as boolean])) as Toggles;
          return (
            <li key={u.id}>
              <details className={`group ${ui.card} open:shadow-[0_2px_12px_rgba(17,18,20,0.06)]`}>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3.5 p-4 [&::-webkit-details-marker]:hidden">
                  <Avatar text={`${u.first_name} ${u.last_name}`} />
                  <span className="min-w-0 flex-1 basis-52">
                    <span className={`block text-[15px] font-bold ${u.active ? "" : "text-[#8E929A]"}`}>{u.first_name} {u.last_name}</span>
                    <span className="block truncate text-[13px] text-[#5B5F66]">{u.email} · {u.where}</span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    <Pill>{PRESET_LABELS[u.preset as Preset]}</Pill>
                    {u.title && <Pill tone="outline">{u.title}</Pill>}
                    {u.status === "Not invited" && <Pill tone="crimson">Not invited</Pill>}
                    {u.status === "Invited" && <Pill tone="outline">Invited</Pill>}
                    {!u.active && <Pill tone="outline">Inactive</Pill>}
                  </span>
                  <Chevron />
                </summary>
                <div className="flex flex-col gap-5 border-t border-[#EEEFF1] p-5">
                  <UserForm
                    dealerships={dealerships}
                    reps={reps}
                    initial={{
                      id: u.id, email: u.email, first_name: u.first_name, last_name: u.last_name, title: u.title,
                      preset: u.preset, scope: u.scope, dealershipIds: u.ids, rep_id: u.rep_id, active: u.active,
                      toggles, isSelf: u.id === me.id,
                    }}
                  />
                  {u.active && u.id !== me.id && <div className="border-t border-[#EEEFF1] pt-4"><ResendInviteForm id={u.id} invited={u.status !== "Not invited"} /></div>}
                </div>
              </details>
            </li>
          );
        })}
        {repOnly.map((r) => (
          <li key={r.id}>
            <details className={`group ${ui.card} open:shadow-[0_2px_12px_rgba(17,18,20,0.06)]`}>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3.5 p-4 [&::-webkit-details-marker]:hidden">
                <Avatar text={`${r.first_name} ${r.last_name}`} />
                <span className="min-w-0 flex-1 basis-52">
                  <span className={`block text-[15px] font-bold ${r.active ? "" : "text-[#8E929A]"}`}>{r.first_name} {r.last_name}</span>
                  <span className="block truncate text-[13px] text-[#5B5F66]">{nameById.get(r.dealership_id) ?? "Inactive dealership"}</span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <Pill>Salesperson</Pill>
                  <Pill tone="crimson">Needs an email</Pill>
                  {!r.active && <Pill tone="outline">Inactive</Pill>}
                </span>
                <Chevron />
              </summary>
              <div className="flex flex-col gap-5 border-t border-[#EEEFF1] p-5">
                <div>
                  <h3 className="mb-3 text-[15px] font-extrabold">Add an email for {r.first_name}</h3>
                  <UserForm
                    dealerships={dealerships}
                    reps={reps}
                    initial={{ first_name: r.first_name, last_name: r.last_name, dealershipIds: [r.dealership_id], rep_id: r.id, preset: "salesperson_view", toggles: PRESET_DEFAULTS.salesperson_view }}
                  />
                </div>
                <div className="border-t border-[#EEEFF1] pt-4">
                  <h3 className="mb-3 text-[15px] font-extrabold">Edit this person</h3>
                  <ActionForm action={saveRep} className="flex flex-col gap-4">
                    <input type="hidden" name="id" value={r.id} />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="First name"><input name="first_name" defaultValue={r.first_name} required className={ui.input} /></Field>
                      <Field label="Last name"><input name="last_name" defaultValue={r.last_name} required className={ui.input} /></Field>
                      <Field label="Dealership">
                        <select name="dealership_id" defaultValue={r.dealership_id} className={ui.input}>
                          {dealerships.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </Field>
                    </div>
                    <Switch name="active" label="Active" note="Inactive people keep their history but no longer appear in new entries." defaultChecked={r.active} />
                    <div><button className={ui.dark}>Save changes</button></div>
                  </ActionForm>
                </div>
              </div>
            </details>
          </li>
        ))}
        {users.length + repOnly.length === 0 && <li className={`${ui.card} p-8 text-center text-sm text-[#5B5F66]`}>No one matches.</li>}
      </ul>
    </div>
  );
}
