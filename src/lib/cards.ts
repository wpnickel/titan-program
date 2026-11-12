// Shared by the entry form (browser) and the server pages. Safe to import anywhere.

export type CustomerType = "existing" | "new_logo" | "residential";
export const CUSTOMER_TYPES: { value: CustomerType; label: string }[] = [
  { value: "existing", label: "Existing customer" },
  { value: "new_logo", label: "New logo" },
  { value: "residential", label: "Residential" },
];
export const TYPE_LABELS: Record<CustomerType, string> = { existing: "Existing", new_logo: "New logo", residential: "Residential" };

export type ProductInfo = {
  id: string; key: string; label: string; points: number;
  qualifies_new_logo: boolean; needs_audio_sensor: boolean;
};
export type Option = { id: string; name: string };
export type RepOption = { id: string; name: string; dealership_id: string; dealership: string };
export type FileInfo = { id: string; file_name: string; size_bytes: number };

/** What the form sends to save_tally_card. */
export type CardPayload = {
  id?: string;
  rep_id: string;
  entry_month: string;
  sale_date: string;
  business_name: string;
  zip_code: string;
  industry_id: string;
  customer_type: CustomerType;
  addendum: boolean;
  contract_number: string;
  term_months: number;
  install_amount: number;
  rmr_amount: number;
  comments: string;
  products: { product_id: string; quantity: number }[];
  lead_source_ids: string[];
};

export const MIN_NEW_LOGO = { rmr: 50, install: 250, term: 12 };
export const UPLOAD_TCV = 15000;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 === 0 ? 0 : 2 });

export function tcvOf(rmr: number, term: number, install: number) {
  return Math.round((rmr * term + install) * 100) / 100;
}

/** A live preview of the points on a card. The database is the authority; this mirrors its rules. */
export function previewPoints(products: ProductInfo[], qty: Record<string, number>, term: number) {
  const lines: { label: string; points: number; note?: string }[] = [];
  const hasAudio = products.some((p) => p.key === "audio_sensor" && (qty[p.id] ?? 0) > 0);
  for (const p of products) {
    if ((qty[p.id] ?? 0) <= 0 || p.points <= 0) continue;
    if (p.needs_audio_sensor && !hasAudio) continue;
    lines.push({ label: p.label.replace(/\s*\(.*\)$/, ""), points: p.points, note: p.needs_audio_sensor ? "audio sensors on card" : undefined });
  }
  const total = term >= 12 ? lines.reduce((s, l) => s + l.points, 0) : 0;
  return { lines, total };
}

export type Check = { ok: boolean; label: string; detail: string };

export function newLogoChecks(a: {
  type: CustomerType; addendum: boolean; qualifying: string[]; rmr: number; install: number; term: number; similar: string | null;
}): Check[] {
  const m = money;
  return [
    { ok: a.type === "new_logo" && !a.addendum, label: "Customer type is New logo", detail: a.addendum ? "Addendums are never new logos" : a.type === "new_logo" ? "Not an addendum" : "Choose New logo above" },
    { ok: a.qualifying.length > 0, label: "Qualifying Sonitrol product", detail: a.qualifying.length ? a.qualifying.join(", ") : "Intrusion, Managed Access, Verified Video or S1000" },
    { ok: a.rmr >= MIN_NEW_LOGO.rmr, label: `RMR at least ${m(MIN_NEW_LOGO.rmr)}`, detail: m(a.rmr) },
    { ok: a.install >= MIN_NEW_LOGO.install, label: `Install at least ${m(MIN_NEW_LOGO.install)}`, detail: m(a.install) },
    { ok: a.term >= MIN_NEW_LOGO.term, label: `Term at least ${MIN_NEW_LOGO.term} months`, detail: `${a.term} months` },
    { ok: !a.similar, label: "Not sold to before", detail: a.similar ? `Similar name found: ${a.similar}. It will be verified in audit.` : "No similar customer at this dealership" },
  ];
}

export function needsUpload(type: CustomerType, tcv: number) {
  return type !== "existing" || tcv >= UPLOAD_TCV;
}
