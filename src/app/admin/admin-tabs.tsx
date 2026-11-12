"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Dealerships", href: "/admin/dealerships" },
  { label: "Users", href: "/admin/users" },
  { label: "Reps", href: "/admin/reps" },
] as const;

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <div role="tablist" className="flex gap-1 border-b border-[#E6E7EA]">
      {TABS.map((t) => {
        const on = pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} role="tab" aria-selected={on}
            className={`-mb-px border-b-[3px] px-4 py-3 text-sm font-bold ${on ? "border-[#C8173F] text-[#111214]" : "border-transparent text-[#5B5F66] hover:text-[#111214]"}`}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
