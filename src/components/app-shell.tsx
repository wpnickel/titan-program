import { cookies } from "next/headers";
import type { Profile } from "@/lib/auth/session";
import { signOut } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/server";
import { Sidebar, type NavItem } from "./sidebar";

export const ROLE_LABELS = {
  salesperson_view: "Salesperson (view only)",
  salesperson_enters: "Salesperson (enters own cards)",
  team_admin: "Team Admin (entry-only)",
  manager_owner: "Manager / Owner",
  super_admin: "Super admin",
} as const;

/** The signed-in frame: slim left menu (collapsible) beside the page. Every signed-in page sits inside it. */
export async function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const collapsed = (await cookies()).get("titan_nav")?.value === "collapsed";
  const isAdmin = profile.preset === "super_admin";
  const unread = isAdmin ? ((await (await createClient()).from("alerts").select("id", { count: "exact", head: true }).is("read_at", null)).count ?? 0) : 0;
  const items: NavItem[] = [
    { label: "Home", href: "/", icon: "home" },
    { label: "Tally cards", href: "/cards", icon: "cards" },
    ...(isAdmin || profile.can_report ? [{ label: "Reports", href: "/reports", icon: "reports" as const }] : []),
    ...(isAdmin ? [{ label: "Audit", href: "/audit", icon: "audit" as const, badge: unread }, { label: "Admin", href: "/admin/users", icon: "admin" as const }] : []),
  ];
  return (
    <div className="min-h-screen lg:flex">
      <Sidebar items={items} user={{ firstName: profile.first_name, role: ROLE_LABELS[profile.preset] }} collapsedInitially={collapsed} signOut={signOut} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
