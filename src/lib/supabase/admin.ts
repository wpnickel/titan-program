import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Server-only client with the secret key. It skips row-level security, so it is used
 * only for login codes, trusted devices, and looking up the signed-in user's own profile.
 */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
