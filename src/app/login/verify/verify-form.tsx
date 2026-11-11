"use client";

import { useActionState } from "react";
import { resendCode, verifyCode, type FormState } from "../actions";

const initial: FormState = {};

export function VerifyForm() {
  const [state, action, pending] = useActionState(verifyCode, initial);
  const [resent, resend, resending] = useActionState(resendCode, initial);
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          6-digit code
          <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus
            className="rounded-xl border border-[#CFD1D6] px-3 py-3 text-center text-2xl font-bold tracking-[0.4em]" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input name="remember" type="checkbox" defaultChecked /> Remember this device for 30 days
        </label>
        {state.error && <p role="alert" className="text-sm font-semibold text-[#C8173F]">{state.error}</p>}
        <button disabled={pending} className="rounded-xl bg-[#C8173F] px-4 py-3 text-base font-bold text-white disabled:opacity-60">
          {pending ? "Checking…" : "Sign in"}
        </button>
      </form>
      <form action={resend} className="text-sm">
        <button disabled={resending} className="font-semibold text-[#C8173F] underline">Send a new code</button>
        {resent.notice && <span className="ml-2 text-[#5B5F66]">{resent.notice}</span>}
        {resent.error && <span role="alert" className="ml-2 text-[#C8173F]">{resent.error}</span>}
      </form>
    </div>
  );
}
