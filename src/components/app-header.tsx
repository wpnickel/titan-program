import Image from "next/image";
import Link from "next/link";
import type { Profile } from "@/lib/auth/session";
import { signOut } from "@/app/login/actions";

export const ROLE_LABELS = {
  salesperson_view: "Salesperson (view only)",
  salesperson_enters: "Salesperson (enters own cards)",
  team_admin: "Team Admin (entry-only)",
  manager_owner: "Manager / Owner",
  super_admin: "Super admin",
} as const;

export function AppHeader({ profile, active }: { profile: Profile; active: "Home" | "Tally cards" | "Admin" }) {
  const nav = [{ label: "Home", href: "/" as const }, { label: "Tally cards", href: "/cards" as const }, ...(profile.preset === "super_admin" ? [{ label: "Admin", href: "/admin/users" as const }] : [])];
  return (
    <header className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-[#E6E7EA] bg-white px-8 py-2">
      <Image src="/titan-logo.png" alt="SNDA Sales Titan Program" width={220} height={72} priority className="h-11 w-auto" />
      <nav className="flex gap-1">
        {nav.map((n) => (
          <Link key={n.label} href={n.href}
            className={`rounded-[10px] px-3.5 py-2.5 text-sm font-semibold ${n.label === active ? "bg-[#EEEFF1] text-[#111214]" : "text-[#5B5F66]"}`}>
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-full bg-[#111214] text-sm font-bold text-white">
          {profile.first_name.slice(0, 1).toUpperCase()}
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">{profile.first_name}</div>
          <div className="text-xs text-[#5B5F66]">{ROLE_LABELS[profile.preset]}</div>
        </div>
        <form action={signOut}>
          <button className="ml-2 rounded-xl border border-[#CFD1D6] px-3 py-1.5 text-sm font-semibold">Sign out</button>
        </form>
      </div>
    </header>
  );
}
