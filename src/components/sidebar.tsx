"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type IconKey = "home" | "cards" | "audit" | "admin";
export type NavItem = { label: string; href: string; icon: IconKey; badge?: number };

const ICONS: Record<IconKey, React.ReactNode> = {
  home: <path d="M4 11l8-7 8 7M6 10v9h4v-5h4v5h4v-9" />,
  cards: <><rect x="4" y="5" width="16" height="14" rx="2.5" /><path d="M8 10h8M8 14h5" /></>,
  audit: <><path d="M5 12.5l4.5 4.5L19 7" /><rect x="3.5" y="3.5" width="17" height="17" rx="3.5" /></>,
  admin: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>,
};
const Icon = ({ name }: { name: IconKey }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">{ICONS[name]}</svg>
);

type Props = {
  items: NavItem[];
  user: { firstName: string; role: string };
  collapsedInitially: boolean;
  signOut: () => void | Promise<void>;
};

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  const base = href.startsWith("/admin") ? "/admin" : href;
  return pathname === base || pathname.startsWith(`${base}/`);
}

function Links({ items, collapsed, onNavigate }: { items: NavItem[]; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map((n) => {
        const on = isActive(pathname, n.href);
        return (
          <Link key={n.label} href={n.href as "/"} onClick={onNavigate} title={collapsed ? n.label : undefined} aria-label={collapsed ? n.label : undefined}
            aria-current={on ? "page" : undefined}
            className={`relative flex h-11 items-center gap-3 rounded-xl text-sm font-semibold transition-colors ${collapsed ? "justify-center" : "px-3.5"} ${on ? "bg-[#111214] !text-white" : "!text-[#3A3D42] hover:bg-[#F0F0F2]"}`}>
            <Icon name={n.icon} />
            {!collapsed && <span className="flex-1">{n.label}</span>}
            {n.badge ? <span className={`rounded-full bg-[#C8173F] px-1.5 text-[11px] font-extrabold leading-5 text-white ${collapsed ? "absolute right-1.5 top-1.5 min-w-5 text-center" : ""}`} aria-label={`${n.badge} unread`}>{n.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function UserBlock({ user, collapsed, signOut }: { user: Props["user"]; collapsed: boolean; signOut: Props["signOut"] }) {
  return (
    <div className={`flex flex-col gap-3 ${collapsed ? "items-center" : ""}`}>
      <div className="flex items-center gap-3">
        <div title={collapsed ? `${user.firstName} · ${user.role}` : undefined} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#111214] text-sm font-bold text-white">
          {user.firstName.slice(0, 1).toUpperCase()}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-semibold">{user.firstName}</div>
            <div className="text-xs text-[#5B5F66]">{user.role}</div>
          </div>
        )}
      </div>
      <form action={signOut} className={collapsed ? "" : "w-full"}>
        <button title="Sign out" aria-label="Sign out" className={`cursor-pointer rounded-xl border border-[#CFD1D6] text-sm font-semibold hover:bg-[#F5F5F6] ${collapsed ? "flex size-10 items-center justify-center" : "h-10 w-full"}`}>
          {collapsed
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 4H5v16h4M15 8l4 4-4 4M19 12H9" /></svg>
            : "Sign out"}
        </button>
      </form>
    </div>
  );
}

export function Sidebar({ items, user, collapsedInitially, signOut }: Props) {
  const [collapsed, setCollapsed] = useState(collapsedInitially);
  const [open, setOpen] = useState(false);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try { document.cookie = `titan_nav=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`; } catch { /* the menu still works without it */ }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Desktop: slim sidebar that can collapse to icons. */}
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col gap-6 border-r border-[#E6E7EA] bg-white py-5 transition-[width] duration-200 lg:flex ${collapsed ? "w-[76px] px-3" : "w-[232px] px-4"}`}>
        <Link href="/" aria-label="Home" className={`flex items-center ${collapsed ? "justify-center" : "px-1"}`}>
          {collapsed
            ? <span className="flex size-10 items-center justify-center rounded-xl bg-[#111214] text-lg font-extrabold text-[#C8173F]">T</span>
            : <Image src="/titan-logo.png" alt="SNDA Sales Titan Program" width={220} height={72} priority className="h-11 w-auto" />}
        </Link>
        <Links items={items} collapsed={collapsed} />
        <div className="flex-1" />
        <button type="button" onClick={toggle} aria-expanded={!collapsed} aria-label={collapsed ? "Expand menu" : "Collapse menu"} title={collapsed ? "Expand menu" : undefined}
          className={`flex h-10 cursor-pointer items-center gap-3 rounded-xl text-[13px] font-semibold text-[#5B5F66] hover:bg-[#F0F0F2] ${collapsed ? "justify-center" : "px-3.5"}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={collapsed ? "rotate-180" : ""}><path d="M15 6l-6 6 6 6" /></svg>
          {!collapsed && "Collapse"}
        </button>
        <div className="border-t border-[#EEEFF1] pt-4"><UserBlock user={user} collapsed={collapsed} signOut={signOut} /></div>
      </aside>

      {/* Phone and tablet: top bar with a menu button that opens the same menu as a drawer. */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[#E6E7EA] bg-white px-4 py-2 lg:hidden">
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className="flex size-11 cursor-pointer items-center justify-center rounded-xl border border-[#CFD1D6]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <Link href="/" aria-label="Home"><Image src="/titan-logo.png" alt="SNDA Sales Titan Program" width={220} height={72} className="h-10 w-auto" /></Link>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="absolute inset-0 cursor-default bg-[#111214]/50" />
          <div role="dialog" aria-modal="true" aria-label="Menu" className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col gap-6 bg-white px-4 py-5 shadow-[0_18px_40px_rgba(17,18,20,0.16)]">
            <div className="flex items-center justify-between">
              <Image src="/titan-logo.png" alt="SNDA Sales Titan Program" width={220} height={72} className="h-11 w-auto" />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="flex size-10 cursor-pointer items-center justify-center rounded-xl hover:bg-[#F0F0F2]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <Links items={items} collapsed={false} onNavigate={() => setOpen(false)} />
            <div className="flex-1" />
            <div className="border-t border-[#EEEFF1] pt-4"><UserBlock user={user} collapsed={false} signOut={signOut} /></div>
          </div>
        </div>
      )}
    </>
  );
}
