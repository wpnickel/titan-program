"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_UPLOAD_BYTES, type CardPayload } from "@/lib/cards";

const BUCKET = "tally-uploads";

/** The database raises plain-English errors; show those, and hide anything unexpected. */
function friendly(message: string) {
  return /^(You |Please |Enter |Choose |That |This |Card |A card |Invalid )/.test(message) ? message : "Something went wrong. Please try again.";
}

export async function saveCard(payload: CardPayload): Promise<{ id?: string; error?: string }> {
  await requireUser();
  const p = {
    ...payload,
    term_months: Math.max(0, Math.round(Number(payload.term_months) || 0)),
    install_amount: Math.max(0, Number(payload.install_amount) || 0),
    rmr_amount: Math.max(0, Number(payload.rmr_amount) || 0),
  };
  const { data, error } = await (await createClient()).rpc("save_tally_card", { p });
  if (error) return { error: friendly(error.message) };
  return { id: data as string };
}

export async function submitCard(id: string): Promise<{ error?: string }> {
  await requireUser();
  const { error } = await (await createClient()).rpc("submit_tally_card", { p_id: id });
  return error ? { error: friendly(error.message) } : {};
}

export async function deleteCard(id: string): Promise<{ error?: string }> {
  await requireUser();
  const { error } = await (await createClient()).rpc("delete_tally_card", { p_id: id });
  if (error) return { error: friendly(error.message) };
  redirect("/cards");
}

export async function findSimilar(dealershipId: string, name: string, excludeId?: string) {
  await requireUser();
  const { data } = await (await createClient()).rpc("similar_customers", {
    p_dealership: dealershipId, p_name: name, p_exclude: excludeId ?? null,
  });
  return ((data ?? []) as { business_name: string; first_sale: string; cards: number }[]).map((r) => ({
    name: r.business_name, firstSale: r.first_sale,
  }));
}

/** Step 1 of an upload: check the person may change the card, then hand the browser a one-time upload link. */
export async function prepareUpload(cardId: string, fileName: string, size: number): Promise<{ path?: string; token?: string; error?: string }> {
  await requireUser();
  if (!/\.pdf$/i.test(fileName)) return { error: "Only PDF files can be uploaded." };
  if (!(size > 0) || size > MAX_UPLOAD_BYTES) return { error: "Each file must be 20 MB or smaller." };
  const { data: ok } = await (await createClient()).rpc("can_edit_card", { p_card: cardId });
  if (!ok) return { error: "You cannot change that card." };
  const path = `${cardId}/${randomUUID()}.pdf`;
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "Could not start the upload. Please try again." };
  return { path, token: data.token };
}

/** Step 2: the file is in storage. Confirm it really is a readable PDF, then attach it to the card. */
export async function finishUpload(cardId: string, path: string, fileName: string): Promise<{ file?: { id: string; file_name: string; size_bytes: number }; error?: string }> {
  await requireUser();
  const storage = createAdminClient().storage.from(BUCKET);
  const discard = async (error: string) => { await storage.remove([path]); return { error }; };
  if (!path.startsWith(`${cardId}/`) || !path.endsWith(".pdf")) return { error: "Invalid upload." };

  const { data: blob, error: dl } = await storage.download(path);
  if (dl || !blob) return { error: "The file did not finish uploading. Please try again." };
  if (blob.size > MAX_UPLOAD_BYTES) return discard("Each file must be 20 MB or smaller.");
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return discard("That file is not a PDF. Only PDF files can be uploaded.");
  if (bytes.toString("latin1").includes("/Encrypt")) return discard("That PDF is password protected. Remove the password and add it again.");

  const { data, error } = await (await createClient()).rpc("add_card_file", {
    p_card: cardId, p_path: path, p_name: fileName.slice(0, 200), p_size: bytes.length,
  });
  if (error) return discard(friendly(error.message));
  return { file: { id: data as string, file_name: fileName.slice(0, 200), size_bytes: bytes.length } };
}

export async function removeFile(fileId: string): Promise<{ error?: string }> {
  await requireUser();
  const { data, error } = await (await createClient()).rpc("remove_card_file", { p_file: fileId });
  if (error) return { error: friendly(error.message) };
  if (data) await createAdminClient().storage.from(BUCKET).remove([data as string]);
  return {};
}
