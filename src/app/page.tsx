import Image from "next/image";
import { requireUser } from "@/lib/auth/session";
import { signOut } from "./login/actions";

const ROLE_LABELS = {
  salesperson_view: "Salesperson (view only)",
  salesperson_enters: "Salesperson (enters own cards)",
  team_admin: "Team Admin (entry-only)",
  manager_owner: "Manager / Owner",
  super_admin: "Super admin",
} as const;

export const instant = false;

export default async function Home() {
  const profile = await requireUser();
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="flex items-center justify-between gap-4">
        <Image src="/titan-logo.png" alt="SNDA Sales Titan Program" width={220} height={72} priority className="h-auto w-48" />
        <form action={signOut}>
          <button className="rounded-xl border border-[#CFD1D6] px-4 py-2 text-sm font-semibold">Sign out</button>
        </form>
      </header>
      <section className="rounded-2xl border border-[#E6E7EA] bg-white p-6">
        <h1 className="text-2xl font-extrabold">Welcome, {profile.first_name}</h1>
        <p className="mt-1 text-[#5B5F66]">{ROLE_LABELS[profile.preset]}</p>
        <p className="mt-4 text-sm text-[#5B5F66]">You are signed in. Leaderboards and tally cards are coming next.</p>
      </section>
    </main>
  );
}
