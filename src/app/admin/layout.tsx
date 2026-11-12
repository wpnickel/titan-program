import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { requireSuperAdmin } from "@/lib/auth/session";

export const instant = false;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireSuperAdmin();
  const tabs = [
    { label: "Dealerships", href: "/admin/dealerships" as const },
    { label: "Reps", href: "/admin/reps" as const },
  ];
  return (
    <>
      <AppHeader profile={profile} active="Admin" />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
        <div className="flex gap-2">
          {tabs.map((t) => (
            <Link key={t.label} href={t.href} className="rounded-full border border-[#CFD1D6] bg-white px-4 py-1.5 text-sm font-semibold">{t.label}</Link>
          ))}
        </div>
        {children}
      </main>
    </>
  );
}
