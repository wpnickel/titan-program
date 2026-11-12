import Image from "next/image";
import { redirect } from "next/navigation";
import { ui } from "@/components/ui";
import { acceptLink } from "./actions";

export const instant = false;

// The link in the email opens this page. The one-time token is only used when the person clicks the button,
// so email scanners that open links automatically cannot use it up.
export default async function AcceptPage({ searchParams }: { searchParams: Promise<{ token_hash?: string }> }) {
  const { token_hash } = await searchParams;
  if (!token_hash) redirect("/login?error=link");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-4">
      <Image src="/titan-logo.png" alt="SNDA Sales Titan Program" width={280} height={92} priority className="h-auto w-64 self-center" />
      <div className="rounded-2xl border border-[#E6E7EA] bg-white p-6">
        <h1 className="mb-1 text-xl font-extrabold">Welcome</h1>
        <p className="mb-4 text-sm text-[#5B5F66]">Continue to choose your password for the SNDA Sales Titan Program.</p>
        <form action={acceptLink}>
          <input type="hidden" name="token_hash" value={token_hash} />
          <button className={`${ui.primary} w-full`}>Continue</button>
        </form>
      </div>
    </main>
  );
}
