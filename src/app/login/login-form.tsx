"use client";

import { useActionState } from "react";
import { signIn, type FormState } from "./actions";

const initial: FormState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Email
        <input name="email" type="email" autoComplete="username" required className="rounded-xl border border-[#CFD1D6] px-3 py-3 text-base font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Password
        <input name="password" type="password" autoComplete="current-password" required className="rounded-xl border border-[#CFD1D6] px-3 py-3 text-base font-normal" />
      </label>
      {state.error && <p role="alert" className="text-sm font-semibold text-[#C8173F]">{state.error}</p>}
      <button disabled={pending} className="rounded-xl bg-[#C8173F] px-4 py-3 text-base font-bold text-white disabled:opacity-60">
        {pending ? "Signing in…" : "Continue"}
      </button>
    </form>
  );
}
