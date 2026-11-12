import { ui } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_ORDER, TIEBREAK_LABELS } from "./order";
import { TiebreakForm } from "./tiebreak-form";

export const instant = false;

export default async function RankingRulesPage() {
  const { data } = await (await createClient()).rpc("get_tiebreak_order");
  const order = Array.isArray(data) && data.length === 4 ? (data as string[]) : DEFAULT_ORDER;
  const first = TIEBREAK_LABELS[order[0]!]!.label;
  const second = TIEBREAK_LABELS[order[1]!]!.label;

  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <section className={`${ui.card} flex flex-col gap-4 p-6`}>
        <div>
          <h2 className="text-xl font-extrabold">Tie-breakers</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[#5B5F66]">
            When two reps have the same value in a category, the tie goes to whoever is higher in the categories below, starting at the top of this list.
            For the overall score the same order is used on their category ranks. Reps who are still tied after all four share the rank.
          </p>
        </div>
        <TiebreakForm initial={order} />
        <p className="rounded-xl bg-[#F5F5F6] px-4 py-3 text-[13px] leading-relaxed text-[#3A3D42]">
          Example: with this order, two reps tied on RMR are separated by {first === "RMR" ? second : first} first.
          Months you have already finalized keep the order they were finalized with, so changing this never re-ranks past results.
          A month you reopen and finalize again picks up the current order.
        </p>
      </section>
    </div>
  );
}
