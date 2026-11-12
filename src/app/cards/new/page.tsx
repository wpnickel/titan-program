import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ui } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { CardForm } from "../card-form";
import { defaultMonth, loadFormLists } from "../load";

export const instant = false;

export default async function NewCardPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const profile = await requireUser();
  const { month } = await searchParams;
  const lists = await loadFormLists();
  const canEnter = lists.reps.length > 0 && lists.months.length > 0;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppShell profile={profile}>
      <main className="mx-auto flex max-w-[1296px] flex-col gap-6 px-4 py-8 sm:px-8">
        {canEnter ? (
          <CardForm
            {...lists}
            initial={{
              submitted: false, rep_id: lists.reps.length === 1 ? lists.reps[0]!.id : "", entry_month: month && lists.months.includes(month) ? month : defaultMonth(lists.months),
              sale_date: today, business_name: "", zip_code: "", industry_id: "", customer_type: "existing", addendum: false,
              contract_number: "", term_months: "", install_amount: "", rmr_amount: "", comments: "", quantities: {},
              lead_source_ids: [], files: [],
            }}
          />
        ) : (
          <section className={`${ui.card} p-6`}>
            <h1 className="text-2xl font-extrabold">Tally cards</h1>
            <p className="mt-3 text-sm text-[#5B5F66]">
              {lists.reps.length === 0 ? "Your account is not set up to enter tally cards." : "No month is open for entry right now."} Ask your administrator if this looks wrong.
            </p>
            <Link href="/cards" className={`${ui.secondary} mt-4`}>Back to tally cards</Link>
          </section>
        )}
      </main>
    </AppShell>
  );
}
