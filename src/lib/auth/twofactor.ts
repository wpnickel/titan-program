import "server-only";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendLoginCode } from "@/lib/email";

const DEVICE_COOKIE = "titan_device";
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_SECONDS = 60;
const REMEMBER_DAYS = 30;
const SESSION_HOURS = 12;

const hashCode = (userId: string, code: string) =>
  createHmac("sha256", process.env.SUPABASE_SECRET_KEY!).update(`${userId}:${code}`).digest("hex");
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Writes a line to the audit log for sign-in events. */
export async function logAuth(userId: string | null, action: string, detail?: Record<string, unknown>) {
  await createAdminClient()
    .from("audit_log")
    .insert({ actor_id: userId, table_name: "auth", row_key: userId, action, new_row: detail ?? null });
}

export async function issueCode(userId: string, email: string): Promise<{ ok: true } | { ok: false; error: string; tooSoon?: boolean }> {
  const db = createAdminClient();
  const { data: last } = await db
    .from("login_codes")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last && Date.now() - new Date(last.created_at).getTime() < RESEND_SECONDS * 1000) {
    return { ok: false, tooSoon: true, error: "A code was just sent. Please wait a minute before asking for another." };
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error } = await db.from("login_codes").insert({
    user_id: userId,
    code_hash: hashCode(userId, code),
    expires_at: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
  });
  if (error) return { ok: false, error: "Could not create a sign-in code. Please try again." };
  try {
    await sendLoginCode(email, code);
  } catch {
    return { ok: false, error: "Could not send the email. Please try again." };
  }
  await logAuth(userId, "CODE_SENT");
  return { ok: true };
}

export async function checkCode(userId: string, input: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = createAdminClient();
  const { data: row } = await db
    .from("login_codes")
    .select("id, code_hash, attempts, expires_at")
    .eq("user_id", userId)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "That code has expired. Sign in again to get a new one." };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: "Too many wrong attempts. Sign in again to get a new code." };
  }
  const a = Buffer.from(hashCode(userId, input.trim()));
  const b = Buffer.from(row.code_hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await db.from("login_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    await logAuth(userId, "CODE_WRONG");
    return { ok: false, error: "That code is not correct." };
  }
  await db.from("login_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);
  return { ok: true };
}

/** Marks this browser as verified: for 30 days if "remember" is on, otherwise 12 hours. */
export async function trustThisDevice(userId: string, remember: boolean) {
  const token = randomBytes(32).toString("base64url");
  const lifetimeMs = remember ? REMEMBER_DAYS * 86_400_000 : SESSION_HOURS * 3_600_000;
  const expires = new Date(Date.now() + lifetimeMs);
  const userAgent = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  await createAdminClient()
    .from("trusted_devices")
    .insert({ user_id: userId, token_hash: hashToken(token), expires_at: expires.toISOString(), user_agent: userAgent });
  (await cookies()).set(DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
  await logAuth(userId, "LOGIN", { remember });
}

export async function isDeviceTrusted(userId: string): Promise<boolean> {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!token) return false;
  const { data } = await createAdminClient()
    .from("trusted_devices")
    .select("id")
    .eq("user_id", userId)
    .eq("token_hash", hashToken(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return !!data;
}
