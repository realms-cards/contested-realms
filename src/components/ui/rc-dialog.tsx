"use client";

import type { ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
} as const;

interface RcDialogProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  /** Called on ×, Escape and (unless disabled) backdrop click */
  onClose?: () => void;
  closeOnBackdrop?: boolean;
  size?: keyof typeof SIZES;
  /** Footer buttons, right-aligned */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Design-system dialog: portal backdrop, panel chrome, display title with a
 * × button, hairline, body and an actions row. Wrap forms and confirms in it.
 */
export function RcDialog({
  title,
  eyebrow,
  onClose,
  closeOnBackdrop = true,
  size = "md",
  actions,
  className,
  children,
}: RcDialogProps) {
  return (
    <Modal
      onClose={onClose}
      closeOnBackdrop={closeOnBackdrop}
      backdropClassName="bg-[rgba(6,10,20,0.82)] backdrop-blur-[4px]"
      className={cn("w-full", SIZES[size], className)}
    >
      <div className="rc-panel thin-scrollbar max-h-[90vh] overflow-y-auto p-6 shadow-[0_18px_40px_rgba(0,0,0,0.55),0_0_18px_rgba(243,207,106,0.2)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {eyebrow && <div className="rc-eyebrow mb-1">{eyebrow}</div>}
            <h2 className="m-0 font-rc-display text-[28px] leading-[1.1] text-rc-fg-strong">
              {title}
            </h2>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-1 cursor-pointer rounded-rc-md px-2 py-0.5 text-xl leading-none text-rc-fg-muted transition-colors hover:bg-rc-line/6 hover:text-rc-fg-strong focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rc-accent-ring"
            >
              ×
            </button>
          )}
        </div>
        <div className="my-4 h-px bg-rc-line/12" />
        <div className="font-rc-sans text-sm leading-relaxed text-rc-fg">
          {children}
        </div>
        {actions && (
          <div className="mt-6 flex flex-wrap justify-end gap-2">{actions}</div>
        )}
      </div>
    </Modal>
  );
}

export default RcDialog;
