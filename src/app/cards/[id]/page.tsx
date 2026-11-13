import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/session";
import { CardEditor } from "../card-editor";

export const instant = false;

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireUser();
  return (
    <AppShell profile={profile}>
      <main className="mx-auto flex max-w-[1296px] flex-col gap-6 px-4 py-8 sm:px-8">
        <CardEditor id={id} />
      </main>
    </AppShell>
  );
}
