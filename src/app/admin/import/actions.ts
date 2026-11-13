"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth/session";
import { PRESET_DEFAULTS, applyRules, type Preset } from "@/lib/permissions";
import { loginActive, parseUsers, wantsLogin, type ParsedUsers, type SheetDealership, type SheetPerson } from "@/lib/import/users-plan";

// Everything here runs as the signed-in super admin, so the audit log records who imported what.
// Nothing is emailed: invites are sent later, from Admin > Users, when Wes is ready.

export type DealershipPlan = SheetDealership & { action: "create" | "exists" };
export type PersonPlan = SheetPerson & { action: "create" | "exists"; login: boolean; loginActive: boolean };
export type UsersPreview =
  | { ok: false; error: string }
  | { ok: true; fileName: string; dealerships: DealershipPlan[]; people: PersonPlan[]; issues: ParsedUsers["issues"] };

const MAX_BYTES = 2 * 1024 * 1024;

async function sheetRows(ws: ExcelJS.Worksheet | undefined): Promise<unknown[][]> {
  if (!ws) return [];
  const out: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const v = row.values as unknown[];
    out.push(Array.from({ length: Math.max(v.length - 1, 0) }, (_, i) => v[i + 1] ?? null));
  });
  return out;
}

/** Step 1: read the uploaded workbook and say what importing it would do. Nothing is saved. */
export async function previewUsers(formData: FormData): Promise<UsersPreview> {
  await requireSuperAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose the Excel file first." };
  if (!/\.xlsx$/i.test(file.name)) return { ok: false, error: "Upload an Excel (.xlsx) file." };
  if (file.size > MAX_BYTES) return { ok: false, error: "That file is too large. The users sheet should be well under 2 MB." };

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load((await file.arrayBuffer()) as ExcelJS.Buffer);
  } catch {
    return { ok: false, error: "That file could not be read. Save it as a regular .xlsx and try again." };
  }
  const users = wb.getWorksheet("Users");
  const dealerships = wb.getWorksheet("Dealerships");
  if (!users || !dealerships) return { ok: false, error: "The workbook needs a “Users” sheet and a “Dealerships” sheet." };
  const parsed = parseUsers(await sheetRows(users), await sheetRows(dealerships));

  const supabase = await createClient();
  const [{ data: ds }, { data: ps }] = await Promise.all([
    supabase.from("dealerships").select("legacy_id, name"),
    supabase.from("profiles").select("legacy_id, email"),
  ]);
  const haveD = new Set((ds ?? []).flatMap((d) => [d.legacy_id != null ? `id:${d.legacy_id}` : "", `n:${String(d.name).toLowerCase()}`]));
  const haveP = new Set((ps ?? []).flatMap((p) => [p.legacy_id != null ? `id:${p.legacy_id}` : "", `e:${String(p.email).toLowerCase()}`]));
  const { data: rs } = await supabase.from("reps").select("legacy_id");
  const haveR = new Set((rs ?? []).map((r) => r.legacy_id));

  return {
    ok: true,
    fileName: file.name,
    issues: parsed.issues,
    dealerships: parsed.dealerships.map((d) => ({ ...d, action: haveD.has(`id:${d.legacyId}`) || haveD.has(`n:${d.name.toLowerCase()}`) ? "exists" : "create" })),
    people: parsed.people.map((p) => {
      const login = wantsLogin(p, false);
      const exists = haveP.has(`id:${p.legacyId}`) || haveP.has(`e:${p.email}`) || (!login && p.role === "Salesperson" && haveR.has(p.legacyId));
      return { ...p, action: exists ? "exists" : "create", login, loginActive: loginActive(p) };
    }),
  };
}

export type ImportOutcome = { legacyId: number; name: string; outcome: "created" | "history" | "exists" | "error"; note?: string };

/** Step 2a: dealerships. Matches by old ID, then by name, and only adds what is missing. */
export async function importDealerships(rows: SheetDealership[]): Promise<{ created: number; existing: number; errors: string[] }> {
  await requireSuperAdmin();
  const supabase = await createClient();
  let created = 0, existing = 0;
  const errors: string[] = [];
  const { data: have } = await supabase.from("dealerships").select("id, name, legacy_id");
  const byId = new Map((have ?? []).filter((d) => d.legacy_id != null).map((d) => [d.legacy_id as number, d]));
  const byName = new Map((have ?? []).map((d) => [String(d.name).toLowerCase(), d]));
  for (const d of rows.slice(0, 200)) {
    const name = String(d.name ?? "").trim();
    const legacyId = Number(d.legacyId);
    if (!name || !Number.isInteger(legacyId)) { errors.push("Skipped a dealership with no name or ID."); continue; }
    if (byId.has(legacyId)) { existing++; continue; }
    const match = byName.get(name.toLowerCase());
    if (match) {
      if (match.legacy_id == null) await supabase.from("dealerships").update({ legacy_id: legacyId }).eq("id", match.id);
      existing++;
      continue;
    }
    // Stores with no 2026 cards stay active: they are still in the program.
    const { error } = await supabase.from("dealerships").insert({ name, legacy_id: legacyId, is_securitas: Boolean(d.securitas), salespeople_enter_own_cards: Boolean(d.entersOwn), active: true });
    if (error) errors.push(`${name}: could not be added.`); else created++;
  }
  revalidatePath("/admin/dealerships");
  return { created, existing, errors };
}

const PRESET_OF: Record<SheetPerson["role"], Preset> = { Salesperson: "salesperson_view", "Team Admin": "team_admin", Manager: "manager_owner", Owner: "manager_owner" };

/** Step 2b: people, a few at a time so each call stays quick. Creates reps and logins; never sends an email. */
export async function importPeople(rows: SheetPerson[], includeFormer: boolean): Promise<ImportOutcome[]> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: ds } = await supabase.from("dealerships").select("id, legacy_id").not("legacy_id", "is", null);
  const dealershipId = new Map((ds ?? []).map((d) => [d.legacy_id as number, d.id as string]));
  const out: ImportOutcome[] = [];

  for (const p of rows.slice(0, 25)) {
    const name = `${p.first} ${p.last}`;
    const done = (outcome: ImportOutcome["outcome"], note?: string) => out.push({ legacyId: p.legacyId, name, outcome, note });
    try {
      const home = dealershipId.get(p.dealershipLegacyId);
      const email = String(p.email ?? "").trim().toLowerCase();
      if (!home || !email || !p.first || !p.last || !Number.isInteger(p.legacyId)) { done("error", "Missing details."); continue; }
      const login = wantsLogin(p, includeFormer);
      const competes = p.role === "Salesperson";

      const { data: byLegacy } = await supabase.from("profiles").select("id, legacy_id").eq("legacy_id", p.legacyId).maybeSingle();
      const prof = byLegacy ?? (await supabase.from("profiles").select("id, legacy_id").eq("email", email).maybeSingle()).data;
      if (prof) {
        if (prof.legacy_id == null) await supabase.from("profiles").update({ legacy_id: p.legacyId }).eq("id", prof.id);
        done("exists", "Already has a login.");
        continue;
      }

      let repId: string | null = null;
      let newRep = false;
      if (competes) {
        const { data: rep } = await supabase.from("reps").select("id").eq("legacy_id", p.legacyId).maybeSingle();
        if (rep) repId = rep.id;
        else {
          const { data: created, error } = await supabase.from("reps")
            .insert({ legacy_id: p.legacyId, first_name: p.first, last_name: p.last, dealership_id: home, active: loginActive(p) }).select("id").single();
          if (error || !created) { done("error", "Could not create the rep."); continue; }
          repId = created.id; newRep = true;
        }
        if (!login) { done(newRep ? "history" : "exists", newRep ? "History only: no login." : "Already imported."); continue; }
      }

      const preset: Preset = competes && p.entersOwn ? "salesperson_enters" : PRESET_OF[p.role];
      const base = PRESET_DEFAULTS[preset];
      const toggles = applyRules(preset, {
        ...base,
        can_enter_own: competes ? p.entersOwn : base.can_enter_own,
        participates_in_rankings: competes ? p.participates : false,
        can_ai_search: base.can_ai_search || p.ai,
      });
      const covered = [home, ...p.others.map((l) => dealershipId.get(l)).filter((x): x is string => Boolean(x))];
      const assigned = !competes && p.role !== "Team Admin" && covered.length > 1;

      const created = await admin.auth.admin.createUser({ email, email_confirm: true });
      if (created.error || !created.data.user) {
        if (newRep && repId) await supabase.from("reps").delete().eq("id", repId);
        done("error", /already|exists|registered/i.test(created.error?.message ?? "") ? "A login with that email already exists." : "Could not create the login.");
        continue;
      }
      const userId = created.data.user.id;
      const { error: pErr } = await supabase.from("profiles").insert({
        id: userId, email, legacy_id: p.legacyId, first_name: p.first, last_name: p.last, preset,
        scope: assigned ? "assigned" : competes ? "own" : "dealership",
        dealership_id: assigned ? null : home, rep_id: competes ? repId : null,
        active: loginActive(p), ...toggles,
      });
      if (pErr) {
        await admin.auth.admin.deleteUser(userId);
        if (newRep && repId) await supabase.from("reps").delete().eq("id", repId);
        done("error", "Could not save the login.");
        continue;
      }
      if (assigned) {
        const { error: aErr } = await supabase.from("profile_dealerships").insert(covered.map((d) => ({ profile_id: userId, dealership_id: d })));
        if (aErr) { done("created", "Created, but the extra dealerships were not saved. Open them in Users and add them."); continue; }
      }
      done("created", loginActive(p) ? undefined : "Login created switched off.");
    } catch {
      done("error", "Unexpected error.");
    }
  }
  revalidatePath("/admin/users");
  return out;
}
