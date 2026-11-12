"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPasswordSessionUser } from "@/lib/auth/session";
import { logAuth } from "@/lib/auth/twofactor";
import type { ActionState } from "@/components/action-form";

export async function setPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getPasswordSessionUser();
  if (!user) redirect("/login?error=link");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 12) return { error: "Use at least 12 characters." };
  if (password !== confirm) return { error: "The two passwords do not match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Could not set that password. Try a different one." };

  await logAuth(user.id, "PASSWORD_SET");
  // They sign in normally next, which adds the email code step.
  await supabase.auth.signOut();
  redirect("/login?notice=password-set");
}
