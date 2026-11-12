"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Uses the one-time link from an invite or password-reset email, then sends the person to choose a password. */
export async function acceptLink(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  if (!tokenHash) redirect("/login?error=link");
  const { error } = await (await createClient()).auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
  if (error) redirect("/login?error=link");
  redirect("/auth/set-password");
}
