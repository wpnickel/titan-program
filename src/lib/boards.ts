import { money } from "@/lib/cards";

/** One rep on a board: category values and ranks from public.board(). A null rank means no rank there (a zero). */
export type BoardRow = {
  rep_id: string; first_name: string; last_name: string; dealership: string; is_securitas: boolean;
  rmr: number; install: number; new_logos: number; points: number;
  rmr_rank: number | null; install_rank: number | null; new_logo_rank: number | null; points_rank: number | null;
  score: number | null; overall_rank: number | null;
};
export type CronusRow = { slot: number; reason: string; rep_id: string; first_name: string; last_name: string; dealership: string; is_securitas: boolean };

export const CATEGORIES = [
  { key: "rmr", tag: "ATLAS", title: "RMR", rank: (r: BoardRow) => r.rmr_rank, value: (r: BoardRow) => r.rmr, fmt: (n: number) => money(n) },
  { key: "install", tag: "LETO", title: "Install", rank: (r: BoardRow) => r.install_rank, value: (r: BoardRow) => r.install, fmt: (n: number) => money(n) },
  { key: "new_logos", tag: "ZEUS", title: "New logos", rank: (r: BoardRow) => r.new_logo_rank, value: (r: BoardRow) => r.new_logos, fmt: (n: number) => String(n) },
  { key: "points", tag: "THEMUS", title: "Sonitrol points", rank: (r: BoardRow) => r.points_rank, value: (r: BoardRow) => r.points, fmt: (n: number) => String(n) },
] as const;
export type Category = (typeof CATEGORIES)[number];

export const repName = (r: { first_name: string; last_name: string }) => `${r.first_name} ${r.last_name}`.trim();
const byName = (a: BoardRow, b: BoardRow) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name);

/** Ranked reps first, in rank order (ties alphabetical); reps with no rank follow if asked for. */
export function ordered(rows: BoardRow[], rank: (r: BoardRow) => number | null, withUnranked = false): BoardRow[] {
  const ranked = rows.filter((r) => rank(r) !== null).sort((a, b) => rank(a)! - rank(b)! || byName(a, b));
  return withUnranked ? [...ranked, ...rows.filter((r) => rank(r) === null).sort(byName)] : ranked;
}

export const monthLabel = (iso: string, withYear = true) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
