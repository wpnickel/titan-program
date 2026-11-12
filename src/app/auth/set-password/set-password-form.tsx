"use client";

import { ActionForm } from "@/components/action-form";
import { Field, ui } from "@/components/ui";
import { setPassword } from "./actions";

export function SetPasswordForm() {
  return (
    <ActionForm action={setPassword} className="flex flex-col gap-4">
      <Field label="New password"><input name="password" type="password" autoComplete="new-password" minLength={12} required className={ui.input} /></Field>
      <Field label="Confirm password"><input name="confirm" type="password" autoComplete="new-password" minLength={12} required className={ui.input} /></Field>
      <button className={ui.primary}>Save password</button>
    </ActionForm>
  );
}
