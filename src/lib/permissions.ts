// Role presets and permission toggles. Shared by the users screen and the server action
// so the screen and the saved result always follow the same rules.

export const PRESETS = ["salesperson_view", "salesperson_enters", "team_admin", "manager_owner", "super_admin"] as const;
export type Preset = (typeof PRESETS)[number];

export const PRESET_LABELS: Record<Preset, string> = {
  salesperson_view: "Salesperson (view only)",
  salesperson_enters: "Salesperson (enters own cards)",
  team_admin: "Team Admin (entry-only)",
  manager_owner: "Manager / Owner",
  super_admin: "Super admin",
};

export const PRESET_NOTES: Record<Preset, string> = {
  salesperson_view: "Competes and sees only their own cards. Someone else enters their cards.",
  salesperson_enters: "Competes, enters and sees only their own cards.",
  team_admin: "Enters cards for the whole dealership. Cannot compete.",
  manager_owner: "Sees their dealership or dealerships. Cannot compete.",
  super_admin: "Full access to everything.",
};

export const TOGGLE_KEYS = [
  "can_enter_own",
  "can_enter_for_dealership",
  "participates_in_rankings",
  "can_report",
  "can_ai_search",
  "can_ai_export",
] as const;
export type ToggleKey = (typeof TOGGLE_KEYS)[number];
export type Toggles = Record<ToggleKey, boolean>;

export const TOGGLE_INFO: { key: ToggleKey; label: string; note: string }[] = [
  { key: "can_enter_own", label: "Enter own cards", note: "Can add and edit their own tally cards in open months." },
  { key: "can_enter_for_dealership", label: "Enter for dealership", note: "Can enter tally cards for any rep at their dealership." },
  { key: "participates_in_rankings", label: "Participates in rankings", note: "Appears on the leaderboards. Needs a linked rep." },
  { key: "can_report", label: "Reports and export", note: "Can use Reports and download CSV or Excel files." },
  { key: "can_ai_search", label: "AI search", note: "Can ask questions about sales data in plain language." },
  { key: "can_ai_export", label: "AI export", note: "Can export what AI search returns. Needs AI search." },
];

const off: Toggles = {
  can_enter_own: false,
  can_enter_for_dealership: false,
  participates_in_rankings: false,
  can_report: false,
  can_ai_search: false,
  can_ai_export: false,
};

export const PRESET_DEFAULTS: Record<Preset, Toggles> = {
  salesperson_view: { ...off, participates_in_rankings: true },
  salesperson_enters: { ...off, can_enter_own: true, participates_in_rankings: true },
  team_admin: { ...off, can_enter_for_dealership: true },
  manager_owner: { ...off, can_report: true },
  super_admin: { ...off, can_enter_for_dealership: true, can_report: true, can_ai_search: true, can_ai_export: true },
};

/** Toggles that are always off for a preset (Team Admins and managers cannot compete; Team Admins get no AI). */
export function lockedOff(preset: Preset): ToggleKey[] {
  switch (preset) {
    case "team_admin":
      return ["participates_in_rankings", "can_ai_search", "can_ai_export", "can_enter_own"];
    case "manager_owner":
    case "super_admin":
      return ["participates_in_rankings", "can_enter_own"];
    default:
      return [];
  }
}

/** Competing presets must be linked to a rep. */
export const needsRep = (preset: Preset) => preset === "salesperson_view" || preset === "salesperson_enters";

/** How many dealerships a preset covers: one, several, or all (super admin). */
export const dealershipMode = (preset: Preset): "one" | "many" | "all" =>
  preset === "manager_owner" ? "many" : preset === "super_admin" ? "all" : "one";

export function applyRules(preset: Preset, toggles: Toggles): Toggles {
  const t = { ...toggles };
  for (const k of lockedOff(preset)) t[k] = false;
  if (!t.can_ai_search) t.can_ai_export = false;
  return t;
}
