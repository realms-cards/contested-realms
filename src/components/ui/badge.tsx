import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "default" | "gold" | "warn" | "ok" | "danger";

const TONES: Record<BadgeTone, string> = {
  default: "border-rc-line/7 bg-rc-line/8 text-rc-fg-muted",
  gold: "border-rc-accent/35 bg-rc-accent/16 text-rc-accent-link",
  warn: "border-rc-accent/35 bg-[rgba(112,65,22,0.45)] text-[#f3e0b3]",
  ok: "border-rc-success/35 bg-rc-success/18 text-[#c5d6a8]",
  danger: "border-rc-danger/40 bg-rc-danger/15 text-[#f0c2b5]",
};

/**
 * realms.cards design-system Badge: small mono pill for org/event tags.
 */
export function Badge({
  tone = "default",
  className,
  title,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] font-rc-mono text-[11px] uppercase tracking-[0.15em]",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export default Badge;
