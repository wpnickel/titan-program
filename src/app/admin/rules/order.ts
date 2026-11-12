// Shared by the page (server) and the form (client), so it cannot live in the "use client" file.
export const TIEBREAK_LABELS: Record<string, { label: string; note: string }> = {
  rmr: { label: "RMR", note: "Monthly recurring revenue on counted cards" },
  install: { label: "Install", note: "Installation dollars on counted cards" },
  new_logos: { label: "New logos", note: "Count of qualifying new logos" },
  points: { label: "Sonitrol points", note: "Sum of card points" },
};
export const DEFAULT_ORDER = ["rmr", "new_logos", "points", "install"];
