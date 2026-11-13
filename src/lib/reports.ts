import { TYPE_LABELS, money, type CustomerType } from "@/lib/cards";

export type ReportRow = {
  id: string; entry_month: string; sale_date: string; created_at: string; dealership_id: string; dealership: string; rep_id: string; rep: string;
  business_name: string; contract_number: string | null; zip_code: string | null; industry_id: string | null; industry: string | null;
  customer_type: CustomerType; addendum: boolean; term_months: number; install_amount: number; rmr_amount: number; tcv: number; points: number;
  is_new_logo: boolean; is_late_entry: boolean; audit_status: "unreviewed" | "approved" | "adjusted" | "on_hold" | null; comments: string | null;
  products: string | null; product_ids: string[]; lead_sources: string | null; lead_source_ids: string[]; files: number;
};

export type Kind = "text" | "date" | "month" | "int" | "money" | "bool" | "type" | "audit";
export type Column = { key: keyof ReportRow; label: string; kind: Kind; adminOnly?: boolean };

/** Every column a report can show. Calculated values (TCV, points, new logo) are included; login data never is. */
export const COLUMNS: Column[] = [
  { key: "sale_date", label: "Sale date", kind: "date" },
  { key: "entry_month", label: "Entry month", kind: "month" },
  { key: "dealership", label: "Dealership", kind: "text" },
  { key: "rep", label: "Rep", kind: "text" },
  { key: "business_name", label: "Business", kind: "text" },
  { key: "contract_number", label: "Contract #", kind: "text" },
  { key: "zip_code", label: "Zip", kind: "text" },
  { key: "industry", label: "Industry", kind: "text" },
  { key: "customer_type", label: "Customer type", kind: "type" },
  { key: "addendum", label: "Addendum", kind: "bool" },
  { key: "term_months", label: "Term", kind: "int" },
  { key: "install_amount", label: "Install", kind: "money" },
  { key: "rmr_amount", label: "RMR", kind: "money" },
  { key: "tcv", label: "TCV", kind: "money" },
  { key: "points", label: "Points", kind: "int" },
  { key: "is_new_logo", label: "New logo", kind: "bool" },
  { key: "is_late_entry", label: "Late entry", kind: "bool" },
  { key: "audit_status", label: "Audit status", kind: "audit", adminOnly: true },
  { key: "products", label: "Products", kind: "text" },
  { key: "lead_sources", label: "Lead sources", kind: "text" },
  { key: "files", label: "PDFs", kind: "int" },
  { key: "comments", label: "Comments", kind: "text" },
  { key: "created_at", label: "Entered on", kind: "date" },
];
export const DEFAULT_COLUMNS = ["sale_date", "dealership", "rep", "business_name", "term_months", "install_amount", "rmr_amount", "tcv", "points"];
export const isRight = (k: Kind) => k === "int" || k === "money";

export type Params = Record<string, string | string[] | undefined>;
const one = (p: Params, k: string) => { const v = p[k]; return (Array.isArray(v) ? v[0] : v)?.trim() || undefined; };
const many = (p: Params, k: string) => { const v = p[k]; return (Array.isArray(v) ? v : v ? [v] : []).flatMap((x) => x.split(",")).filter(Boolean); };

/** The columns chosen in the URL (repeated or comma separated). "all" means every column. Default: the usual nine. */
export function chosenColumns(p: Params, isAdmin: boolean): Column[] {
  const allowed = COLUMNS.filter((c) => !c.adminOnly || isAdmin);
  const keys = many(p, "cols");
  if (keys.includes("all")) return allowed;
  const picked = keys.map((k) => allowed.find((c) => c.key === k)).filter((c): c is Column => Boolean(c));
  return picked.length ? picked : DEFAULT_COLUMNS.map((k) => allowed.find((c) => c.key === k)!);
}

const num = (v: string | undefined) => { const n = v === undefined ? NaN : Number(v.replace(/[$,]/g, "")); return Number.isFinite(n) ? n : undefined; };
const yesNo = (v: string | undefined) => (v === "yes" ? true : v === "no" ? false : undefined);
const month = (v: string | undefined) => (v && /^\d{4}-\d{2}-01$/.test(v) ? v : undefined);

/** Adds the filters from the URL to a query on report_rows. The database still decides which rows the user may see. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyFilters(q: any, p: Params, isAdmin: boolean) {
  const from = month(one(p, "from")), to = month(one(p, "to"));
  if (from) q = q.gte("entry_month", from);
  if (to) q = q.lte("entry_month", to);
  const eq: [string, string | undefined][] = [["dealership_id", one(p, "dealership")], ["rep_id", one(p, "rep")], ["customer_type", one(p, "type")],
    ["industry_id", one(p, "industry")]];
  for (const [col, v] of eq) if (v) q = q.eq(col, v);
  const product = one(p, "product"); if (product) q = q.contains("product_ids", [product]);
  const source = one(p, "source"); if (source) q = q.contains("lead_source_ids", [source]);
  const nl = yesNo(one(p, "newlogo")); if (nl !== undefined) q = q.eq("is_new_logo", nl);
  const ad = yesNo(one(p, "addendum")); if (ad !== undefined) q = q.eq("addendum", ad);
  const late = yesNo(one(p, "late")); if (late !== undefined) q = q.eq("is_late_entry", late);
  const audit = one(p, "audit"); if (isAdmin && audit && ["unreviewed", "approved", "adjusted", "on_hold"].includes(audit)) q = q.eq("audit_status", audit);
  const ranges: [string, string, string][] = [["term_months", "term_min", "term_max"], ["rmr_amount", "rmr_min", "rmr_max"], ["install_amount", "install_min", "install_max"]];
  for (const [col, lo, hi] of ranges) {
    const a = num(one(p, lo)), b = num(one(p, hi));
    if (a !== undefined) q = q.gte(col, a);
    if (b !== undefined) q = q.lte(col, b);
  }
  const text = one(p, "q")?.replace(/[%,()]/g, " ").trim();
  if (text) q = q.or(`business_name.ilike.%${text}%,contract_number.ilike.%${text}%`);
  return q;
}

export function sortOf(p: Params): { key: string; asc: boolean } {
  const k = one(p, "sort");
  const key = k && COLUMNS.some((c) => c.key === k) ? k : "sale_date";
  return { key, asc: one(p, "dir") === "asc" };
}
export const pageOf = (p: Params) => Math.max(1, Math.floor(Number(one(p, "page")) || 1));

const dateFmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
export const AUDIT_LABELS = { unreviewed: "Unreviewed", approved: "Approved", adjusted: "Adjusted", on_hold: "Waiting for information" } as const;

/** What a cell shows on screen. */
export function display(c: Column, row: ReportRow): string {
  const v = row[c.key] as unknown;
  if (v === null || v === undefined || v === "") return "";
  switch (c.kind) {
    case "date": return dateFmt(String(v), { month: "short", day: "numeric", year: "numeric" });
    case "month": return dateFmt(String(v), { month: "short", year: "numeric" });
    case "money": return money(Number(v));
    case "bool": return v ? "Yes" : "No";
    case "type": return TYPE_LABELS[v as CustomerType] ?? String(v);
    case "audit": return AUDIT_LABELS[v as keyof typeof AUDIT_LABELS] ?? String(v);
    default: return String(v);
  }
}

/** A cell for a file: real numbers and dates where there are some, so Excel can sort and add them up. */
export function fileValue(c: Column, row: ReportRow, excel: boolean): string | number | Date | boolean | null {
  const v = row[c.key] as unknown;
  if (v === null || v === undefined || v === "") return null;
  switch (c.kind) {
    case "date": return excel ? new Date(`${String(v).slice(0, 10)}T00:00:00Z`) : String(v).slice(0, 10);
    case "month": return excel ? new Date(`${String(v).slice(0, 10)}T00:00:00Z`) : String(v).slice(0, 7);
    case "money": case "int": return Number(v);
    default: return display(c, row);
  }
}
