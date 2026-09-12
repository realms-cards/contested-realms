import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface RcEmptyProps {
  title: ReactNode;
  /** Mono sub line */
  children?: ReactNode;
  /** Optional call to action rendered under the text */
  action?: ReactNode;
  className?: string;
}

/** Dashed empty/zero state: display headline, mono hint, optional action. */
export function RcEmpty({ title, children, action, className }: RcEmptyProps) {
  return (
    <div
      className={cn(
        "rounded-rc-md border border-dashed border-rc-line/22 bg-black/30 px-6 py-10 text-center",
        className,
      )}
    >
      <div className="font-rc-display text-[26px] text-rc-fg-strong">
        {title}
      </div>
      {children && (
        <div className="mt-1.5 font-rc-mono text-xs tracking-[0.1em] text-rc-fg-subtle">
          {children}
        </div>
      )}
      {action && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>
      )}
    </div>
  );
}

export default RcEmpty;
