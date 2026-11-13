"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { matchesFilter, sortRows, type QueueRow, type SortKey } from "./audit-types";

type Ctx = {
  rows: QueueRow[];
  visible: QueueRow[];
  selectedId: string;
  query: string; setQuery: (v: string) => void;
  sort: SortKey; setSort: (v: SortKey) => void;
  filter: string; setFilter: (v: string) => void;
  hrefFor: (id: string) => string;
  position: number;      // 1-based place of the selected card in the list on screen, 0 if it is not in it
  prevHref: string | null;
  skipHref: string | null;   // the next card in the list, whatever its status
  nextTodoHref: string;      // where to go after approving: the next card still to do
  editing: boolean; openEdit: () => void; closeEdit: () => void;   // the edit-card popup
};

const AuditCtx = createContext<Ctx | null>(null);
export const useAudit = () => {
  const c = useContext(AuditCtx);
  if (!c) throw new Error("useAudit must be used inside AuditProvider");
  return c;
};

/** Holds the search, sort and filter for the list, so the list and the review pane agree on what "next" means. */
export function AuditProvider({ rows, selectedId, month, children }: { rows: QueueRow[]; selectedId: string; month: string; children: ReactNode }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("queue");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(false);

  const value = useMemo<Ctx>(() => {
    const q = query.trim().toLowerCase();
    const found = rows.filter((r) => matchesFilter(r, filter) && (!q || `${r.business_name} ${r.rep_name} ${r.dealership}`.toLowerCase().includes(q)));
    const visible = sortRows(found, sort);
    const hrefFor = (id: string) => `/audit?month=${month}&card=${id}`;
    const idx = visible.findIndex((r) => r.card_id === selectedId);
    const after = visible.slice(idx + 1);
    const nextTodo = after.find((r) => r.audit_status === "unreviewed") ?? visible.find((r) => r.audit_status === "unreviewed" && r.card_id !== selectedId);
    const skip = idx >= 0 ? visible[idx + 1] : visible[0];
    return {
      rows, visible, selectedId, query, setQuery, sort, setSort, filter, setFilter, hrefFor,
      position: idx + 1,
      prevHref: idx > 0 ? hrefFor(visible[idx - 1].card_id) : null,
      skipHref: skip ? hrefFor(skip.card_id) : null,
      nextTodoHref: nextTodo ? hrefFor(nextTodo.card_id) : `/audit?month=${month}`,
      editing, openEdit: () => setEditing(true), closeEdit: () => setEditing(false),
    };
  }, [rows, selectedId, month, query, sort, filter, editing]);

  return <AuditCtx.Provider value={value}>{children}</AuditCtx.Provider>;
}
