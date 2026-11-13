// Reads an export from the old Titan Program and turns each row into a card ready to import.
// Pure functions only (no database, no network): the same rules run in the preview and in the import.

export type CardType = "existing" | "new_logo" | "residential";
export type ImportCard = {
  legacy_id: number; rep_legacy_id: number; dealership_legacy_id: number;
  entry_month: string; sale_date: string; business_name: string; zip: string; industry: string;
  customer_type: CardType; addendum: boolean; contract_number: string; term: number; install: number; rmr: number;
  comments: string; created_at: string | null; updated_at: string | null; deleted: boolean;
  products: Record<string, number>; lead_sources: string[];
  /** What the old system recorded: points, and whether it counted the card as a new logo. */
  old_points: number | null; old_new_logo: boolean;
};
export type CardIssue = { level: "error" | "warning"; text: string; count?: number };
export type ParsedCards = { cards: ImportCard[]; issues: CardIssue[]; skippedRows: number; repairedRows: number; residentialIndustry: number };

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const str = (v: unknown): string => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && "text" in (v as object)) return String((v as { text: unknown }).text ?? "").trim();
  if (typeof v === "object" && "result" in (v as object)) return String((v as { result: unknown }).result ?? "").trim();
  return String(v).trim();
};
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "object" && v !== null && "result" in v) v = (v as { result: unknown }).result;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const pad = (n: number) => String(n).padStart(2, "0");
/** A date from an Excel cell, as YYYY-MM-DD. Dates are read as written, with no time-zone shift. */
function dateOf(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(v));
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
function stampOf(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  const s = str(v);
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const d = new Date(s.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? "" : "Z"));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Old product columns and the product each one is in the new app. Anything the form no longer offers stays as history. */
export const PRODUCT_COLUMNS: Record<string, string> = {
  flexip: "sonitrol_intrusion", accessmodule: "managed_access", accessinfinias: "access_infinias", accesscontrolother: "access_control_other",
  verifiedvideo: "verified_video", nvrother: "nvr_other", firepanel: "fire_panel", totalguard: "total_guard", multisensor: "multi_sensor",
  audiosensor: "audio_sensor", intrusionsystemother: "intrusion_other", firecommunicators: "fire_communicator", s1000: "s1000", sonitrolwarranty: "warranty",
};
/** Old lead-source columns and their names in the new app. */
export const LEAD_COLUMNS: Record<string, string> = {
  callin: "Call in", coldcall: "Cold Call", customeraddon: "Customer Add On", customermove: "Customer Move", customernewsite: "Customer New Site",
  customerreferral: "Customer Referral", franchisordistrubutor: "Franchisor/Distributor", franchisordistributor: "Franchisor/Distributor",
  leadsgroup: "Leads Group", networking: "Networking", newconstruction: "New Construction", onlinelead: "Online Lead",
  policereferral: "Police Referral", takeover: "Takeover", upgrade: "Upgrade",
};

const REQUIRED = ["tallycardid", "userid", "dealershipid", "month", "year", "businessname", "salesdate", "term", "rmr", "installation"];

/** First row = headings. Only the first column with a given heading is used (the files repeat some headings in the login columns). */
export function parseCards(rows: unknown[][]): ParsedCards {
  const issues: CardIssue[] = [];
  const out: ParsedCards = { cards: [], issues, skippedRows: 0, repairedRows: 0, residentialIndustry: 0 };
  const heads = (rows[0] ?? []).map(norm);
  const at = (name: string) => heads.indexOf(name);
  const missing = REQUIRED.filter((k) => at(k) < 0);
  if (missing.length) {
    issues.push({ level: "error", text: `The file is missing these columns: ${missing.join(", ")}. Use the same layout as the earlier exports.` });
    return out;
  }
  const c = {
    id: at("tallycardid"), user: at("userid"), dealer: at("dealershipid"), month: at("month"), year: at("year"), name: at("businessname"),
    zip: at("businesszipcode"), date: at("salesdate"), nl: at("newlogo"), resid: at("residential"), add: at("addendum"), contract: at("contractnumber"),
    term: at("term"), install: at("installation"), rmr: at("rmr"), industry: at("industry"), points: Math.max(at("scoutpoints"), -1),
    comments: at("comments"), created: at("createdat"), updated: at("updatedat"), deleted: at("isdeleted"),
  };
  if (c.points < 0) issues.push({ level: "warning", text: "This file has no points column (Scout Points), so the old points cannot be compared or kept." });
  const prods = heads.map((h, i) => ({ i, key: PRODUCT_COLUMNS[h] })).filter((x) => x.key);
  const leads = heads.map((h, i) => ({ i, name: LEAD_COLUMNS[h] })).filter((x) => x.name);
  const seen = new Set<number>();
  let dup = 0, noName = 0, noDate = 0, badMonth = 0, negative = 0;

  let last: ImportCard | null = null;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (row.every((x) => x == null || x === "")) continue;
    const idN = num(row[c.id]);
    // Some comments contain line breaks and split a card over two rows in the export. The loose pieces belong to the card above.
    if (idN == null || !Number.isInteger(idN) || idN <= 0) {
      const text = row.filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).trim()).join(" ");
      if (last && text) { last.comments = `${last.comments} ${text}`.trim(); out.repairedRows++; } else out.skippedRows++;
      continue;
    }
    if (seen.has(idN)) { dup++; continue; }
    seen.add(idN);
    const name = str(row[c.name]);
    const year = num(row[c.year]); const month = num(row[c.month]);
    const sale = dateOf(row[c.date]);
    if (!name) { noName++; out.skippedRows++; continue; }
    let entry: string | null = year && month && month >= 1 && month <= 12 ? `${year}-${pad(month)}-01` : null;
    if (!entry && sale) { entry = `${sale.slice(0, 7)}-01`; badMonth++; }
    if (!entry) { noDate++; out.skippedRows++; continue; }
    const saleDate = sale ?? entry;
    if (!sale) noDate++;

    // A comment with a line break can also shift the rest of the row one column to the right.
    let created = stampOf(row[c.created]); let updated = stampOf(row[c.updated]);
    let comments = str(row[c.comments]);
    let deletedCell: unknown = c.deleted >= 0 ? row[c.deleted] : 0;
    if (c.created >= 0 && row[c.created] != null && created == null && typeof row[c.created] === "string") {
      comments = `${comments} ${str(row[c.created])}`.trim();
      created = updated; updated = c.deleted >= 0 ? stampOf(row[c.deleted]) : null;
      deletedCell = c.deleted >= 0 ? row[c.deleted + 1] : 0;
      out.repairedRows++;
    }
    const nlv = c.nl >= 0 ? num(row[c.nl]) ?? 0 : 0;
    const type: CardType = nlv === 2 || (c.resid >= 0 && (num(row[c.resid]) ?? 0) === 1) ? "residential" : nlv === 1 ? "new_logo" : "existing";
    const industry = str(row[c.industry]);
    if (industry.toLowerCase() === "residential" && type === "existing") out.residentialIndustry++;

    const products: Record<string, number> = {};
    for (const p of prods) { const q = num(row[p.i]); if (q != null && q >= 1) products[p.key] = Math.round(q); }
    const sources = leads.filter((l) => (num(row[l.i]) ?? 0) > 0).map((l) => l.name);
    let term = num(row[c.term]) ?? 0; let rmr = num(row[c.rmr]) ?? 0; let install = num(row[c.install]) ?? 0;
    if (term < 0 || rmr < 0 || install < 0) { negative++; term = Math.max(term, 0); rmr = Math.max(rmr, 0); install = Math.max(install, 0); }
    const del = deletedCell != null && !(deletedCell instanceof Date) && /^(1|true|y|yes)$/i.test(str(deletedCell));
    const card: ImportCard = {
      legacy_id: idN, rep_legacy_id: num(row[c.user]) ?? 0, dealership_legacy_id: num(row[c.dealer]) ?? 0, entry_month: entry, sale_date: saleDate,
      business_name: name, zip: c.zip >= 0 ? str(row[c.zip]) : "", industry, customer_type: type, addendum: c.add >= 0 && (num(row[c.add]) ?? 0) > 0,
      contract_number: c.contract >= 0 ? str(row[c.contract]) : "", term: Math.round(term), install, rmr, comments, created_at: created, updated_at: updated,
      deleted: del, products, lead_sources: sources, old_points: c.points >= 0 ? num(row[c.points]) : null, old_new_logo: nlv === 1,
    };
    out.cards.push(card);
    last = card;
  }
  if (dup) issues.push({ level: "warning", text: "Cards listed more than once in the file (the first is used)", count: dup });
  if (noName) issues.push({ level: "warning", text: "Rows with no business name were skipped", count: noName });
  if (noDate) issues.push({ level: "warning", text: "Cards with no usable date were skipped or given the first day of their month", count: noDate });
  if (badMonth) issues.push({ level: "warning", text: "Cards with no valid month used the month of their sale date", count: badMonth });
  if (negative) issues.push({ level: "warning", text: "Cards with a negative amount or term were set to 0", count: negative });
  return out;
}

export type CatalogProduct = { key: string; points: number; needs_audio_sensor: boolean };

/** Points the current rules give a card: each product once, intrusion only with an audio sensor, nothing under 12 months. */
export function scoreCard(c: Pick<ImportCard, "products" | "term">, catalog: CatalogProduct[]): number {
  if (c.term < 12) return 0;
  const audio = (c.products["audio_sensor"] ?? 0) > 0;
  let pts = 0;
  for (const p of catalog) if ((c.products[p.key] ?? 0) > 0 && (!p.needs_audio_sensor || audio)) pts += p.points;
  return pts;
}

/** Years from this one on are scored with the current rules. Earlier years keep exactly what the old system recorded. */
export const DEFAULT_RECALCULATE_FROM = 2026;
export const modeFor = (card: Pick<ImportCard, "entry_month">, recalcFrom: number): "recorded" | "calculate" =>
  Number(card.entry_month.slice(0, 4)) >= recalcFrom ? "calculate" : "recorded";

/** The JSON the database function expects. */
export function toRow(c: ImportCard, mode: "recorded" | "calculate") {
  const { old_points, old_new_logo, ...rest } = c;
  return mode === "recorded" ? { ...rest, points: old_points ?? 0, new_logo: old_new_logo } : { ...rest, old_points };
}
