import type { ReactNode } from "react";
import { cn } from "cn";

export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Mono({
  children,
  className,
  tone,
}: {
  children: ReactNode;
  className?: string;
  tone?: "cyan" | "amber" | "red" | "emerald" | "muted";
}) {
  const toneClass =
    tone === "cyan"
      ? "text-cyan-400"
      : tone === "amber"
        ? "text-amber-400"
        : tone === "red"
          ? "text-rose-400"
          : tone === "emerald"
            ? "text-emerald-400"
            : tone === "muted"
              ? "text-zinc-500"
              : "text-zinc-100";
  return (
    <span className={cn("font-mono tabular-nums", toneClass, className)}>
      {children}
    </span>
  );
}
