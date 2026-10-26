import type { ButtonHTMLAttributes, ReactNode } from "react";

export const inr = (n: any) =>
  n === null || n === undefined || n === ""
    ? "-"
    : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n));

export const fmtDate = (d?: string | null, withYear = false) =>
  d
    ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        ...(withYear ? { year: "numeric" } : {}),
      })
    : "";

export const titleCase = (s?: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

export function Btn({
  variant = "primary",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "gate" }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const styles = {
    primary: "bg-teal text-white hover:bg-teal-dark",
    gate: "bg-rani text-white hover:bg-[#a52358]",
    ghost: "border border-line bg-white text-ink hover:bg-mist",
    danger: "border border-line bg-white text-rani hover:bg-mist",
  };
  return <button className={`${base} ${styles[variant]} ${className}`} {...rest} />;
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-teal" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal border-t-transparent" aria-hidden="true" />
      {label}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-line px-5 py-8 text-center">
      <p className="font-display text-lg font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-ink/70">{children}</div>}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
    </label>
  );
}

export const num = (s: any) => (s === "" || s === null || s === undefined ? null : Number(s));
