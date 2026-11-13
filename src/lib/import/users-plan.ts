// Reads the "users and dealerships" workbook and turns it into a list of dealerships and people to import.
// Pure functions only (no database, no network), so the same rules run in the preview and the import.

export type SheetDealership = { legacyId: number; name: string; securitas: boolean; entersOwn: boolean };
export type Role = "Salesperson" | "Team Admin" | "Manager" | "Owner";
export type SheetPerson = {
  legacyId: number; first: string; last: string; email: string;
  dealership: string; dealershipLegacyId: number;
  role: Role; entersOwn: boolean; participates: boolean; others: number[]; ai: boolean;
  /** Cards in 2026, when the sheet says. Used to decide who gets a login. */
  cards2026: number | null;
};
export type SheetIssue = { level: "error" | "warning"; where: string; text: string };
export type ParsedUsers = { dealerships: SheetDealership[]; people: SheetPerson[]; issues: SheetIssue[] };

const ROLES: Role[] = ["Salesperson", "Team Admin", "Manager", "Owner"];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const text = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object" && v !== null && "text" in v) return String((v as { text: unknown }).text ?? "").trim(); // hyperlink cells
  if (typeof v === "object" && v !== null && "result" in v) return String((v as { result: unknown }).result ?? "").trim(); // formula cells
  return String(v).trim();
};
const yes = (v: unknown) => /^(y|yes|true|1)$/i.test(text(v));
const intOf = (v: unknown): number | null => {
  const n = Number(text(v));
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Turns two sheets of cell values (first row = headings) into dealerships and people, collecting every problem found. */
export function parseUsers(usersRows: unknown[][], dealershipRows: unknown[][]): ParsedUsers {
  const issues: SheetIssue[] = [];
  const head = (rows: unknown[][]) => {
    const h = (rows[0] ?? []).map((c) => text(c).toLowerCase());
    return (name: string) => h.findIndex((x) => x === name.toLowerCase() || x.startsWith(name.toLowerCase()));
  };

  const dh = head(dealershipRows);
  const dIdx = { id: dh("old dealership id"), name: dh("dealership"), sec: dh("securitas flag"), own: dh("salespeople enter their own cards") };
  const dealerships: SheetDealership[] = [];
  const byName = new Map<string, SheetDealership>();
  if (dIdx.id < 0 || dIdx.name < 0) issues.push({ level: "error", where: "Dealerships", text: "The Dealerships sheet needs the columns “Old Dealership ID” and “Dealership”." });
  else {
    dealershipRows.slice(1).forEach((r, i) => {
      const name = text(r[dIdx.name]);
      const legacyId = intOf(r[dIdx.id]);
      if (!name && legacyId == null) return;
      const where = `Dealerships row ${i + 2}`;
      if (!name || legacyId == null) return void issues.push({ level: "error", where, text: "Needs both a dealership ID and a name." });
      if (byName.has(name.toLowerCase())) return void issues.push({ level: "error", where, text: `“${name}” is listed twice.` });
      if (dealerships.some((d) => d.legacyId === legacyId)) return void issues.push({ level: "error", where, text: `Dealership ID ${legacyId} is listed twice.` });
      const d = { legacyId, name, securitas: dIdx.sec >= 0 && yes(r[dIdx.sec]), entersOwn: dIdx.own >= 0 && yes(r[dIdx.own]) };
      dealerships.push(d);
      byName.set(name.toLowerCase(), d);
    });
  }

  const uh = head(usersRows);
  const u = {
    id: uh("old rep id"), first: uh("first name"), last: uh("last name"), email: uh("email"), dealership: uh("dealership"),
    role: uh("role"), own: uh("enters own cards"), forAll: uh("enters for dealership"), part: uh("participates"),
    others: uh("other dealerships"), ai: uh("ai search"), c26: uh("cards 2026"),
  };
  const missing = (["id", "first", "last", "email", "dealership", "role"] as const).filter((k) => u[k] < 0);
  const people: SheetPerson[] = [];
  if (missing.length) issues.push({ level: "error", where: "Users", text: "The Users sheet is missing columns. Start from the template and keep the headings." });
  else {
    const seenEmail = new Map<string, number>();
    const seenId = new Set<number>();
    usersRows.slice(1).forEach((r, i) => {
      const first = text(r[u.first]);
      const last = text(r[u.last]);
      const email = text(r[u.email]).toLowerCase();
      const legacyId = intOf(r[u.id]);
      if (!first && !last && !email && legacyId == null) return;
      const where = `Users row ${i + 2} (${[first, last].filter(Boolean).join(" ") || "no name"})`;
      const err = (t: string) => void issues.push({ level: "error", where, text: t });
      if (legacyId == null) return err("Needs an Old Rep ID. Use the ID from the old system, or any unused number above 900000 for a new person.");
      if (seenId.has(legacyId)) return err(`Old Rep ID ${legacyId} is on more than one row.`);
      seenId.add(legacyId);
      if (!first || !last) return err("Needs a first and last name.");
      if (!EMAIL.test(email)) return err("Needs a valid email address.");
      if (seenEmail.has(email)) return err(`${email} is already used on row ${seenEmail.get(email)}.`);
      seenEmail.set(email, i + 2);
      const role = ROLES.find((x) => x.toLowerCase() === text(r[u.role]).toLowerCase());
      if (!role) return err("Role must be Salesperson, Team Admin, Manager or Owner.");
      const dName = text(r[u.dealership]);
      const home = byName.get(dName.toLowerCase());
      if (!home) return err(`Dealership “${dName}” is not on the Dealerships sheet.`);
      const others: number[] = [];
      for (const n of (u.others >= 0 ? text(r[u.others]) : "").split(/[;,]/).map((s) => s.trim()).filter(Boolean)) {
        const d = byName.get(n.toLowerCase());
        if (!d) return err(`Other dealership “${n}” is not on the Dealerships sheet.`);
        if (d.legacyId !== home.legacyId && !others.includes(d.legacyId)) others.push(d.legacyId);
      }
      let participates = u.part >= 0 ? yes(r[u.part]) : role === "Salesperson";
      let entersOwn = u.own >= 0 ? yes(r[u.own]) : false;
      if (role !== "Salesperson") {
        if (participates) issues.push({ level: "warning", where, text: `${role}s do not compete, so “Participates in Rankings” is set to No.` });
        if (entersOwn) issues.push({ level: "warning", where, text: `${role}s do not have their own cards, so “Enters Own Cards” is set to No.` });
        participates = false;
        entersOwn = false;
      }
      if (role !== "Salesperson" && role !== "Manager" && role !== "Owner" && others.length) issues.push({ level: "warning", where, text: "Only managers and owners can cover other dealerships. The extras were ignored." });
      const c26 = u.c26 >= 0 ? intOf(r[u.c26]) ?? (text(r[u.c26]) === "0" ? 0 : null) : null;
      people.push({
        legacyId, first, last, email, dealership: home.name, dealershipLegacyId: home.legacyId, role, entersOwn, participates,
        others: role === "Manager" || role === "Owner" ? others : [], ai: u.ai >= 0 && yes(r[u.ai]), cards2026: c26,
      });
    });
  }
  return { dealerships, people, issues };
}

/** Whether someone gets a login when imported. Salespeople with no 2026 cards are history only, unless the sheet has no card counts. */
export const wantsLogin = (p: SheetPerson, includeFormer: boolean) => p.role !== "Salesperson" || p.cards2026 == null || p.cards2026 > 0 || includeFormer;
/** Imported logins for people who left are created switched off, so nobody can sign in until Wes turns them on. */
export const loginActive = (p: SheetPerson) => p.role !== "Salesperson" || p.cards2026 == null || p.cards2026 > 0;
