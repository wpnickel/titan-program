import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/session";

export const instant = false;

export default async function Home() {
  const profile = await requireUser();
  return (
    <AppShell profile={profile}>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <section className="rounded-2xl border border-[#E6E7EA] bg-white p-6">
          <h1 className="text-2xl font-extrabold">Welcome, {profile.first_name}</h1>
          <p className="mt-4 text-sm text-[#5B5F66]">You are signed in. Leaderboards and tally cards are coming next.</p>
        </section>
      </main>
    </AppShell>
  );
}
