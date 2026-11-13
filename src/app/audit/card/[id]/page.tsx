import { requireSuperAdmin } from "@/lib/auth/session";
import { CardEditor } from "@/app/cards/card-editor";

export const instant = false;

/** The tally card on its own, without the menu, for the edit popup on the audit page. */
export default async function AuditCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireSuperAdmin();
  return (
    <main className="mx-auto flex max-w-[1296px] flex-col gap-5 px-4 py-5 sm:px-6">
      <CardEditor id={id} embedded />
    </main>
  );
}
