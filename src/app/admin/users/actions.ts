"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth/session";
import { logAuth } from "@/lib/auth/twofactor";
import { sendInvite } from "@/lib/email";
import { siteOrigin } from "@/lib/site";
import { PRESETS, TOGGLE_KEYS, applyRules, dealershipMode, needsRep, type Preset, type Toggles } from "@/lib/permissions";
import type { ActionState } from "@/components/action-form";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Makes a one-time link for choosing a password and emails it. */
async function emailPasswordLink(email: string, firstName: string): Promise<boolean> {
  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: "recovery", email });
  if (error || !data.properties?.hashed_token) return false;
  const link = `${await siteOrigin()}/auth/accept?token_hash=${encodeURIComponent(data.properties.hashed_token)}`;
  try {
    await sendInvite(email, firstName, link);
    return true;
  } catch {
    return false;
  }
}

export async function saveUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSuperAdmin();
  const id = str(formData, "id");
  const isNew = !id;

  let preset = str(formData, "preset") as Preset;
  if (!PRESETS.includes(preset)) return { error: "Choose a role." };
  const firstName = str(formData, "first_name");
  const lastName = str(formData, "last_name");
  const email = str(formData, "email").toLowerCase();
  if (!firstName || !lastName) return { error: "Enter a first and last name." };
  if (isNew && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };

  let active = formData.get("active") === "on";
  if (id === me.id) {
    // Guard against locking yourself out.
    preset = "super_admin";
    active = true;
  }

  const raw = Object.fromEntries(TOGGLE_KEYS.map((k) => [k, formData.get(k) === "on"])) as Toggles;
  const toggles = applyRules(preset, raw);

  // Work out scope and dealerships from the preset.
  const dealershipIds = [...new Set(formData.getAll("dealership_ids").map(String).filter(Boolean))];
  const mode = dealershipMode(preset);
  let scope: "own" | "dealership" | "assigned" | "all";
  let homeDealership: string | null = null;
  let assigned: string[] = [];
  if (mode === "all") {
    scope = "all";
  } else if (mode === "one") {
    if (dealershipIds.length !== 1) return { error: "Choose the dealership." };
    scope = needsRep(preset) ? "own" : "dealership";
    homeDealership = dealershipIds[0];
  } else if (formData.get("all_dealerships") === "on") {
    scope = "all";
  } else if (dealershipIds.length === 0) {
    return { error: "Choose at least one dealership." };
  } else if (dealershipIds.length === 1) {
    scope = "dealership";
    homeDealership = dealershipIds[0];
  } else {
    scope = "assigned";
    assigned = dealershipIds;
  }

  // Salespeople need a rep (the competing record). Use the chosen existing rep, or create one from their name.
  let repId: string | null = needsRep(preset) ? str(formData, "rep_id") || null : null;
  const createRep = needsRep(preset) && !repId;

  const row = {
    first_name: firstName,
    last_name: lastName,
    title: str(formData, "title") || null,
    preset,
    scope,
    dealership_id: homeDealership,
    rep_id: repId,
    active,
    ...toggles,
  };

  const supabase = await createClient(); // The admin's own session, so the audit log records who made the change.

  let newRepId: string | null = null;
  if (createRep) {
    const { data: rep, error: rErr } = await supabase
      .from("reps")
      .insert({ first_name: firstName, last_name: lastName, dealership_id: homeDealership })
      .select("id")
      .single();
    if (rErr || !rep) return { error: "Could not create the rep record. Please try again." };
    newRepId = rep.id;
    repId = rep.id;
    row.rep_id = rep.id;
  } else if (repId && homeDealership) {
    // Keep the rep at the same dealership as their login.
    await supabase.from("reps").update({ dealership_id: homeDealership }).eq("id", repId);
  }
  const undoRep = async () => {
    if (newRepId) await supabase.from("reps").delete().eq("id", newRepId);
  };

  if (!isNew) {
    const { error } = await supabase.from("profiles").update(row).eq("id", id);
    if (error) await undoRep();
    if (error) return { error: error.code === "23505" ? "That rep is already linked to another login." : "Could not save. Please try again." };
    await supabase.from("profile_dealerships").delete().eq("profile_id", id);
    if (assigned.length) {
      const { error: e2 } = await supabase.from("profile_dealerships").insert(assigned.map((d) => ({ profile_id: id, dealership_id: d })));
      if (e2) return { error: "Saved, but could not save the dealership list. Please try again." };
    }
    revalidatePath("/admin/users");
    return { notice: "Saved." };
  }

  // New user: create the login, then the profile, then email the invite.
  const admin = createAdminClient();
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error || !created.data.user) {
    await undoRep();
    return { error: /already|exists|registered/i.test(created.error?.message ?? "") ? "A login with that email already exists." : "Could not create the login. Please try again." };
  }
  const userId = created.data.user.id;

  const { error: pErr } = await supabase.from("profiles").insert({ id: userId, email, ...row });
  if (pErr) {
    await admin.auth.admin.deleteUser(userId);
    await undoRep();
    return { error: pErr.code === "23505" ? "That rep is already linked to another login." : "Could not save. Please try again." };
  }
  if (assigned.length) {
    const { error: aErr } = await supabase.from("profile_dealerships").insert(assigned.map((d) => ({ profile_id: userId, dealership_id: d })));
    if (aErr) {
      await supabase.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
      await undoRep();
      return { error: "Could not save the dealership list. Nothing was created." };
    }
  }

  const sent = await emailPasswordLink(email, firstName);
  await logAuth(me.id, sent ? "INVITE_SENT" : "INVITE_FAILED", { to: email });
  revalidatePath("/admin/users");
  return sent
    ? { notice: `Invited ${firstName}. They will get an email to set a password.` }
    : { notice: `Created ${firstName}, but the invite email did not send. Open them in the list and use “Send invite again”.` };
}

export async function resendInvite(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSuperAdmin();
  const id = str(formData, "id");
  const { data: profile } = await (await createClient()).from("profiles").select("email, first_name, active").eq("id", id).maybeSingle();
  if (!profile) return { error: "User not found." };
  if (!profile.active) return { error: "This user is inactive. Reactivate them first." };
  const sent = await emailPasswordLink(profile.email, profile.first_name);
  await logAuth(me.id, sent ? "INVITE_SENT" : "INVITE_FAILED", { to: profile.email, resend: true });
  return sent ? { notice: "Sent. The link in the email works once and expires." } : { error: "The email did not send. Please try again." };
}
