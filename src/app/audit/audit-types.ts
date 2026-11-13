import type { CustomerType } from "@/lib/cards";

export type AuditStatus = "unreviewed" | "approved" | "adjusted" | "on_hold";

export type QueueRow = {
  card_id: string; business_name: string; rep_name: string; dealership: string; sale_date: string; entry_month: string;
  customer_type: CustomerType; addendum: boolean; points: number; is_new_logo: boolean; reasons: string[];
  audit_status: AuditStatus; notes: string | null;
};

export const REASONS: Record<string, { filter: string; tag: string }> = {
  new_logo: { filter: "New logos", tag: "New logo" },
  name_match: { filter: "Name matches", tag: "Name match" },
  failed_checks: { filter: "Failed checks", tag: "Failed checks" },
  late_entry: { filter: "Late entries", tag: "Late entry" },
  under_12: { filter: "Under 12 months", tag: "Under 12 months" },
  residential: { filter: "Residential", tag: "Residential" },
  missing_pdf: { filter: "Missing PDFs", tag: "Missing PDF" },
};

export const STATUS_LABEL: Record<AuditStatus, string> = {
  unreviewed: "Unreviewed", approved: "Approved", adjusted: "Adjusted", on_hold: "Waiting for information",
};

export const SORTS = [
  { value: "queue", label: "To do first" },
  { value: "date", label: "Sale date" },
  { value: "dealership", label: "Dealership" },
  { value: "rep", label: "Salesperson" },
  { value: "business", label: "Business" },
] as const;
export type SortKey = (typeof SORTS)[number]["value"];

/** The built-in filters. Anything else is one of the REASONS. */
export const BASE_FILTERS = [
  { value: "all", label: "All" },
  { value: "todo", label: "To do" },
  { value: "waiting", label: "Waiting" },
  { value: "done", label: "Done" },
  { value: "untagged", label: "No tags" },
] as const;

export function matchesFilter(r: QueueRow, filter: string): boolean {
  switch (filter) {
    case "all": return true;
    case "todo": return r.audit_status === "unreviewed";
    case "waiting": return r.audit_status === "on_hold";
    case "done": return r.audit_status === "approved" || r.audit_status === "adjusted";
    case "untagged": return r.reasons.length === 0;
    default: return r.reasons.includes(filter);
  }
}

export function sortRows(rows: QueueRow[], sort: SortKey): QueueRow[] {
  if (sort === "queue") return rows;
  const key = (r: QueueRow) => sort === "date" ? r.sale_date : sort === "dealership" ? r.dealership : sort === "rep" ? r.rep_name : r.business_name;
  return [...rows].sort((a, b) => key(a).localeCompare(key(b)) || a.business_name.localeCompare(b.business_name));
}
