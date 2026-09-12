import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Small gold spaced-caps label above the title */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** One or two sentences under the title */
  description?: ReactNode;
  /** Buttons/links aligned to the right (wrap under the title on phones) */
  actions?: ReactNode;
  size?: "lg" | "md";
  className?: string;
}

/**
 * Page title block: display-font heading with optional eyebrow, description
 * and an actions slot. One per page, directly under the nav.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  size = "lg",
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && <div className="rc-eyebrow mb-1.5">{eyebrow}</div>}
        <h1
          className={cn(
            "m-0 font-rc-display leading-none text-rc-fg-strong [text-shadow:0_0_24px_rgba(212,169,74,0.2)]",
            size === "lg"
              ? "text-[clamp(32px,3.2vw,48px)]"
              : "text-[clamp(26px,2.4vw,34px)]",
          )}
        >
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-[68ch] font-rc-sans text-sm leading-relaxed text-rc-fg-muted">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {actions}
        </div>
      )}
    </header>
  );
}

interface PanelHeaderProps {
  title: ReactNode;
  /** Mono meta text next to the title ("12 decks · 3 public") */
  meta?: ReactNode;
  /** Right-aligned controls */
  children?: ReactNode;
  className?: string;
}

/** Header row of an `.rc-panel` section: display h2, meta, spacer, controls. */
export function PanelHeader({
  title,
  meta,
  children,
  className,
}: PanelHeaderProps) {
  return (
    <div className={cn("rc-panel-head", className)}>
      <h2 className="m-0 font-rc-display text-[26px] leading-none text-rc-fg-strong">
        {title}
      </h2>
      {meta && (
        <span className="font-rc-mono text-xs tracking-[0.1em] text-rc-fg-subtle">
          {meta}
        </span>
      )}
      <div className="flex-1" />
      {children}
    </div>
  );
}

export default PageHeader;
