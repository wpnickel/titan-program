import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Opens an uploaded PDF. Anyone who can see the card (row-level security) gets a short-lived link. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await ctx.params;
  const { data: file } = await (await createClient())
    .from("tally_card_files").select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!file) return new NextResponse("Not found", { status: 404 });
  const { data } = await createAdminClient().storage.from("tally-uploads").createSignedUrl(file.storage_path, 60, { download: false });
  if (!data) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
