"use client";

import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * realms.cards design-system Button (v2, gold accent).
 * Mirrors ui_kits/web/Button.jsx from the bound design system.
 */
export const rcButtonVariants = cva(
  "inline-flex cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-rc-md border font-rc-sans font-medium tracking-[0.01em] shadow-rc-sm transition-[background-color,color,border-color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rc-accent-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border-rc-accent-press bg-gradient-to-b from-rc-accent-hover to-rc-accent text-rc-accent-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_1px_2px_rgba(0,0,0,0.45)] hover:-translate-y-px hover:from-[#f0cb6d] hover:to-rc-accent-hover hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_6px_14px_rgba(212,169,74,0.25),0_0_0_1px_rgba(243,207,106,0.35)]",
        destructive:
          "border-white/8 bg-rc-danger text-[#faf3e5] hover:bg-rc-danger-hover",
        outline:
          "border-rc-line/28 bg-transparent text-rc-fg hover:border-rc-accent hover:bg-rc-accent/8 hover:text-rc-fg-strong",
        secondary:
          "border-rc-line/14 bg-rc-line/6 text-rc-fg hover:bg-rc-line/10",
        ghost:
          "border-transparent bg-transparent text-rc-fg-muted shadow-none hover:bg-rc-line/6 hover:text-rc-fg",
        link: "border-transparent bg-transparent text-rc-accent-link underline underline-offset-[3px] shadow-none hover:text-rc-accent-hover",
      },
      size: {
        default: "h-[38px] px-[18px] text-sm",
        sm: "h-8 px-3 text-[13px]",
        lg: "h-[46px] px-[26px] text-base",
        icon: "h-[38px] w-[38px] p-0 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface RcButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof rcButtonVariants> {}

export const RcButton = forwardRef<HTMLButtonElement, RcButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(rcButtonVariants({ variant, size, className }))}
      {...props}
    />
  ),
);
RcButton.displayName = "RcButton";

export type RcLinkButtonProps = ComponentProps<typeof Link> &
  VariantProps<typeof rcButtonVariants>;

/** Same look as RcButton, rendered as a Next.js link. */
export function RcLinkButton({
  className,
  variant,
  size,
  ...props
}: RcLinkButtonProps) {
  return (
    <Link
      className={cn(rcButtonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
