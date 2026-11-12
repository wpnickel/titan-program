"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Field, Switch, ui } from "@/components/ui";
import {
  PRESETS, PRESET_DEFAULTS, PRESET_LABELS, PRESET_NOTES, TOGGLE_INFO, applyRules, dealershipMode, lockedOff, needsRep,
  type Preset, type Toggles,
} from "@/lib/permissions";
import { resendInvite, saveUser } from "./actions";

export type DealershipOption = { id: string; name: string };
export type RepOption = { id: string; name: string; dealership_id: string; takenBy: string | null };
export type UserInitial = {
  id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  title?: string | null;
  preset?: Preset;
  scope?: "own" | "dealership" | "assigned" | "all";
  dealershipIds?: string[];
  rep_id?: string | null;
  active?: boolean;
  toggles?: Toggles;
  isSelf?: boolean;
};

export function UserForm({ dealerships, reps, initial }: { dealerships: DealershipOption[]; reps: RepOption[]; initial: UserInitial }) {
  const isNew = !initial.id;
  const [preset, setPreset] = useState<Preset>(initial.preset ?? "salesperson_enters");
  const [toggles, setToggles] = useState<Toggles>(initial.toggles ?? PRESET_DEFAULTS[initial.preset ?? "salesperson_enters"]);
  const [selected, setSelected] = useState<string[]>(initial.dealershipIds ?? []);
  const [allDealerships, setAllDealerships] = useState(initial.scope === "all" && initial.preset === "manager_owner");
  const [repId, setRepId] = useState(initial.rep_id ?? "");

  const mode = dealershipMode(preset);
  const locked = lockedOff(preset);
  const shownToggles = applyRules(preset, toggles);
  const repChoices = reps.filter((r) => selected.includes(r.dealership_id) && (!r.takenBy || r.takenBy === initial.id));

  function choosePreset(p: Preset) {
    setPreset(p);
    setToggles(PRESET_DEFAULTS[p]);
    if (dealershipMode(p) === "one") setSelected((s) => s.slice(0, 1));
    if (!needsRep(p)) setRepId("");
  }

  return (
    <ActionForm action={saveUser} className="flex flex-col gap-5">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name"><input name="first_name" defaultValue={initial.first_name} required className={ui.input} /></Field>
        <Field label="Last name"><input name="last_name" defaultValue={initial.last_name} required className={ui.input} /></Field>
        <Field label="Email">
          {isNew
            ? <input name="email" type="email" required autoComplete="off" className={ui.input} />
            : <input value={initial.email} readOnly className={`${ui.input} bg-[#F5F5F6] text-[#5B5F66]`} />}
        </Field>
        <Field label="Title (optional)"><input name="title" defaultValue={initial.title ?? ""} placeholder="e.g. General Manager" className={ui.input} /></Field>
      </div>

      <div>
        <Field label="Role preset">
          <select name="preset" value={preset} disabled={initial.isSelf} onChange={(e) => choosePreset(e.target.value as Preset)} className={ui.input}>
            {PRESETS.map((p) => <option key={p} value={p}>{PRESET_LABELS[p]}</option>)}
          </select>
        </Field>
        {initial.isSelf && <input type="hidden" name="preset" value={preset} />}
        <p className="mt-1.5 text-xs text-[#5B5F66]">{PRESET_NOTES[preset]} Choosing a role fills in the permissions below. You can change them afterwards.</p>
      </div>

      {mode === "one" && (
        <Field label="Dealership">
          <select name="dealership_ids" value={selected[0] ?? ""} onChange={(e) => { setSelected(e.target.value ? [e.target.value] : []); setRepId(""); }} required className={ui.input}>
            <option value="" disabled>Choose a dealership</option>
            {dealerships.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
      )}

      {mode === "many" && (
        <div>
          <span className={ui.label}>Dealerships</span>
          <Switch name="all_dealerships" label="All dealerships" note="Company-wide access." checked={allDealerships} onChange={setAllDealerships} />
          {!allDealerships && (
            <div className="mt-2 flex flex-wrap gap-2">
              {dealerships.map((d) => {
                const on = selected.includes(d.id);
                return (
                  <label key={d.id} className={`cursor-pointer rounded-full px-3.5 py-2 text-[13px] font-semibold ${on ? "bg-[#111214] text-white" : "border border-dashed border-[#8E929A] text-[#3A3D42]"}`}>
                    <input type="checkbox" name="dealership_ids" value={d.id} checked={on} className="sr-only"
                      onChange={(e) => setSelected((s) => (e.target.checked ? [...s, d.id] : s.filter((x) => x !== d.id)))} />
                    {on ? "" : "+ "}{d.name}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {needsRep(preset) && (
        <Field label="Rep record">
          <select name="rep_id" value={repId} onChange={(e) => setRepId(e.target.value)} className={ui.input}>
            <option value="">{initial.id ? "Create a new rep for this person" : "Create a new rep from this name (recommended)"}</option>
            {repChoices.map((r) => <option key={r.id} value={r.id}>Use existing: {r.name}</option>)}
          </select>
          <span className="mt-1.5 block text-xs text-[#5B5F66]">
            The rep is the record that holds their tally cards and leaderboard numbers. A new one is created for you. Choose an existing rep only if this person already has one, for example from imported history.
          </span>
        </Field>
      )}

      <div>
        <div className={`${ui.eyebrow} mb-1`}>PERMISSIONS</div>
        <div>
          {TOGGLE_INFO.map((t) => (
            <Switch key={t.key} name={t.key} label={t.label} note={locked.includes(t.key) ? "Not available for this role." : t.note}
              checked={shownToggles[t.key]} disabled={locked.includes(t.key)}
              onChange={(on) => setToggles((s) => ({ ...s, [t.key]: on }))} />
          ))}
        </div>
      </div>

      {!isNew && (
        <Switch name="active" label="Active" note={initial.isSelf ? "You cannot deactivate your own login." : "Inactive users cannot sign in. Their history is kept."} defaultChecked={initial.active} disabled={initial.isSelf} />
      )}
      {initial.isSelf && <input type="hidden" name="active" value="on" />}

      <div><button className={isNew ? ui.primary : ui.dark}>{isNew ? "Send invite" : "Save changes"}</button></div>
    </ActionForm>
  );
}

export function ResendInviteForm({ id }: { id: string }) {
  return (
    <ActionForm action={resendInvite} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <button className={ui.secondary}>Send invite again</button>
      <span className="text-xs text-[#5B5F66]">Also works as a password reset.</span>
    </ActionForm>
  );
}
