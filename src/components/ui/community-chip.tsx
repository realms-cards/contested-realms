import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const KINDS = {
  discord:
    "border-[rgba(170,140,220,0.35)] bg-gradient-to-r from-[rgba(110,95,170,0.18)] to-[rgba(150,125,200,0.28)] text-[#dcd0ef] hover:shadow-[0_0_18px_rgba(170,140,220,0.35)]",
  patreon:
    "border-[rgba(150,180,220,0.35)] bg-gradient-to-r from-[rgba(99,130,182,0.18)] to-[rgba(150,180,220,0.28)] text-[#cfe0f5] hover:shadow-[0_0_18px_rgba(150,180,220,0.35)]",
} as const;

/**
 * realms.cards design-system CommunityChip: external community link
 * (Discord / Patreon) with a soft glow on hover.
 */
export function CommunityChip({
  kind = "discord",
  href,
  className,
  children,
}: {
  kind?: keyof typeof KINDS;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-2 rounded-rc-md border px-3.5 py-2 font-rc-sans text-[13px] tracking-[0.02em] no-underline shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition-[box-shadow,transform] duration-200 hover:-translate-y-px",
        KINDS[kind],
        className,
      )}
    >
      {children}
    </a>
  );
}

export default CommunityChip;
