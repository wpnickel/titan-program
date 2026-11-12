import type { ReactNode } from "react";

// Shared look: black and white with the crimson accent from the logo.
export const ui = {
  card: "rounded-[18px] border border-[#E6E7EA] bg-white",
  input:
    "h-11 w-full rounded-[10px] border border-[#CFD1D6] bg-white px-3 text-sm font-medium text-[#111214] placeholder:text-[#8E929A] outline-none transition focus:border-[#C8173F] focus:ring-4 focus:ring-[#C8173F]/10",
  label: "mb-1.5 block text-[13px] font-semibold text-[#3A3D42]",
  primary:
    "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#C8173F] px-5 text-[15px] font-extrabold text-white transition hover:bg-[#9E1031] disabled:opacity-60",
  secondary:
    "inline-flex h-10 cursor-pointer items-center justify-center rounded-[10px] border border-[#111214] bg-white px-4 text-[13px] font-bold text-[#111214] transition hover:bg-[#F5F5F6]",
  dark: "inline-flex h-11 cursor-pointer items-center justify-center rounded-xl bg-[#111214] px-5 text-sm font-bold text-white transition hover:bg-[#2A2C31] disabled:opacity-60",
  eyebrow: "text-[13px] font-extrabold tracking-[0.06em] text-[#5B5F66]",
};

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className={ui.label}>{label}</span>
      {children}
    </label>
  );
}

/** A pill-shaped tag, like the role and status chips in the mockups. */
export function Pill({ children, tone = "light" }: { children: ReactNode; tone?: "light" | "dark" | "crimson" | "outline" | "green" | "amber" }) {
  const tones = {
    light: "bg-[#F0F0F2] text-[#111214]",
    dark: "bg-[#111214] text-white",
    crimson: "bg-[#FBE7EC] text-[#9E1031]",
    outline: "border border-[#CFD1D6] text-[#5B5F66]",
    green: "bg-[#E3F4E8] text-[#1F7A3D]",
    amber: "bg-[#FFF4DC] text-[#7A4B00]",
  };
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

export function Avatar({ text, size = "md" }: { text: string; size?: "md" | "lg" }) {
  const initials = text.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-[#EEEFF1] font-extrabold ${size === "lg" ? "size-[52px] text-[17px]" : "size-10 text-sm"}`}>
      {initials}
    </span>
  );
}

/** An on/off switch that works inside a normal form (it submits like a checkbox). Pass checked + onChange to control it. */
export function Switch({
  name, label, note, defaultChecked, checked, onChange, disabled,
}: {
  name: string; label: string; note?: string; defaultChecked?: boolean;
  checked?: boolean; onChange?: (on: boolean) => void; disabled?: boolean;
}) {
  const controlled = checked !== undefined;
  return (
    <label className={`flex items-center gap-4 border-t border-[#EEEFF1] py-3 first:border-t-0 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{label}</span>
        {note && <span className="block text-xs leading-snug text-[#5B5F66]">{note}</span>}
      </span>
      <input
        type="checkbox" name={name} disabled={disabled} className="peer sr-only"
        {...(controlled ? { checked, onChange: (e) => onChange?.(e.target.checked) } : { defaultChecked })}
      />
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full bg-[#B8BBC2] transition-colors peer-checked:bg-[#111214] peer-focus-visible:ring-4 peer-focus-visible:ring-[#C8173F]/30 after:absolute after:left-[3px] after:top-[3px] after:size-[22px] after:rounded-full after:bg-white after:shadow-[0_1px_3px_rgba(17,18,20,0.3)] after:transition-transform peer-checked:after:translate-x-5"
      />
    </label>
  );
}

export function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B5F66" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 transition-transform group-open:rotate-180">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
