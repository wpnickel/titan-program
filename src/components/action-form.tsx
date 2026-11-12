"use client";

import { useActionState, type ReactNode } from "react";

export type ActionState = { error?: string; notice?: string };

/** A form that runs a server action and shows its success or error message under the fields. */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState);
  return (
    <form action={formAction} className={className} aria-busy={pending}>
      {children}
      {state.error && <p role="alert" className="w-full text-sm font-semibold text-[#C8173F]">{state.error}</p>}
      {state.notice && <p role="status" className="w-full text-sm font-semibold text-[#1F7A3D]">{state.notice}</p>}
    </form>
  );
}
