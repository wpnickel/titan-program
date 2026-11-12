import { AppShell } from "@/components/app-shell";
import { requireSuperAdmin } from "@/lib/auth/session";
import { AdminTabs } from "./admin-tabs";

export const instant = false;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireSuperAdmin();
  return (
    <AppShell profile={profile}>
      <main className="mx-auto flex max-w-[1100px] flex-col gap-6 px-4 py-8 sm:px-8">
        <h1 className="text-[30px] font-extrabold tracking-[-0.02em]">Admin</h1>
        <AdminTabs />
        {children}
      </main>
    </AppShell>
  );
}
