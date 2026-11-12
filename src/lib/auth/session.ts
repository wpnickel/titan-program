import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDeviceTrusted } from "@/lib/auth/twofactor";

export type Profile = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  title: string | null;
  preset: "salesperson_view" | "salesperson_enters" | "team_admin" | "manager_owner" | "super_admin";
  scope: "own" | "dealership" | "assigned" | "all";
  active: boolean;
};

/** The signed-in user's password session (the first step only). */
export async function getPasswordSessionUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function getActiveProfile(userId: string): Promise<Profile | null> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, email, first_name, last_name, title, preset, scope, active")
    .eq("id", userId)
    .maybeSingle();
  return data && data.active ? (data as Profile) : null;
}

/**
 * Use at the top of every signed-in page. The user must have a valid password session,
 * an active profile, and a verified device (email code done). Otherwise they go back to sign in.
 */
export async function requireUser(): Promise<Profile> {
  const user = await getPasswordSessionUser();
  if (!user) redirect("/login");
  const profile = await getActiveProfile(user.id);
  if (!profile || !(await isDeviceTrusted(user.id))) {
    await (await createClient()).auth.signOut();
    redirect("/login");
  }
  return profile;
}

/** For admin pages: only super admins get in. */
export async function requireSuperAdmin(): Promise<Profile> {
  const profile = await requireUser();
  if (profile.preset !== "super_admin") redirect("/");
  return profile;
}
