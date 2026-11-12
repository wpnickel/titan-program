import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendLateEntryAlert } from "@/lib/email";

/** Email any alerts that have not been sent yet to the alert address (the super admin's). Safe to call often. */
export async function emailPendingAlerts() {
  const admin = createAdminClient();
  const { data: setting } = await admin.from("app_settings").select("value").eq("key", "late_entry_alert_email").maybeSingle();
  const to = setting?.value;
  if (!to) return;
  // Claim the unsent alerts first so two requests at once cannot send the same email twice.
  const { data: claimed } = await admin.from("alerts").update({ emailed_at: new Date().toISOString() })
    .is("emailed_at", null).eq("kind", "late_entry").select("id, message");
  for (const a of claimed ?? []) {
    try { await sendLateEntryAlert(to, a.message); }
    catch { await admin.from("alerts").update({ emailed_at: null }).eq("id", a.id); }
  }
}
