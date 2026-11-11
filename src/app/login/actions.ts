"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveProfile, getPasswordSessionUser } from "@/lib/auth/session";
import { checkCode, isDeviceTrusted, issueCode, logAuth, trustThisDevice } from "@/lib/auth/twofactor";

export type FormState = { error?: string; notice?: string };

const BAD_LOGIN = "Incorrect email or password.";

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: BAD_LOGIN };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: BAD_LOGIN };

  const profile = await getActiveProfile(data.user.id);
  if (!profile) {
    await supabase.auth.signOut();
    return { error: BAD_LOGIN };
  }

  if (await isDeviceTrusted(data.user.id)) {
    await logAuth(data.user.id, "LOGIN", { trustedDevice: true });
    redirect("/");
  }

  const sent = await issueCode(data.user.id, profile.email);
  if (!sent.ok && !sent.tooSoon) {
    await supabase.auth.signOut();
    return { error: sent.error };
  }
  redirect("/login/verify");
}

export async function verifyCode(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getPasswordSessionUser();
  if (!user) redirect("/login");
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your email." };

  const result = await checkCode(user.id, code);
  if (!result.ok) return { error: result.error };

  await trustThisDevice(user.id, formData.get("remember") === "on");
  redirect("/");
}

export async function resendCode(): Promise<FormState> {
  const user = await getPasswordSessionUser();
  if (!user) redirect("/login");
  const profile = await getActiveProfile(user.id);
  if (!profile) redirect("/login");
  const sent = await issueCode(user.id, profile.email);
  return sent.ok ? { notice: "A new code is on its way." } : { error: sent.error };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
