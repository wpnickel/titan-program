import Image from "next/image";
import { redirect } from "next/navigation";
import { VerifyForm } from "./verify-form";
import { getPasswordSessionUser } from "@/lib/auth/session";

export const instant = false;

export default async function VerifyPage() {
  const user = await getPasswordSessionUser();
  if (!user) redirect("/login");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-4">
      <Image src="/titan-logo.png" alt="SNDA Sales Titan Program" width={280} height={92} priority className="h-auto w-64 self-center" />
      <div className="rounded-2xl border border-[#E6E7EA] bg-white p-6">
        <h1 className="mb-1 text-xl font-extrabold">Check your email</h1>
        <p className="mb-4 text-sm text-[#5B5F66]">We sent a 6-digit code to the email on your account. It expires in 10 minutes.</p>
        <VerifyForm />
      </div>
    </main>
  );
}
