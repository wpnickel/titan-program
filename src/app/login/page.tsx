import Image from "next/image";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { getPasswordSessionUser } from "@/lib/auth/session";
import { isDeviceTrusted } from "@/lib/auth/twofactor";

export const instant = false;

export default async function LoginPage() {
  const user = await getPasswordSessionUser();
  if (user && (await isDeviceTrusted(user.id))) redirect("/");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-4">
      <Image src="/titan-logo.png" alt="SNDA Sales Titan Program" width={280} height={92} priority className="h-auto w-64 self-center" />
      <div className="rounded-2xl border border-[#E6E7EA] bg-white p-6">
        <h1 className="mb-4 text-xl font-extrabold">Sign in</h1>
        <LoginForm />
      </div>
    </main>
  );
}
