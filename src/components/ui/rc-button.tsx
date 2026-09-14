"use client";

import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Active/selected tint per tone, for elements that can't be an RcButton
 * (conditional className on a plain element). RcButton applies the same tint
 * through `aria-pressed` / `data-active="true"` and its `tone` prop.
 */
export const RC_TONE_TINT = {
  gold: "border-rc-accent/60 bg-rc-accent/14 text-rc-spark",
  success: "border-rc-success/60 bg-rc-success/16 text-rc-success-ink",
  info: "border-rc-info/60 bg-rc-info/18 text-rc-info-ink",
  moonlight: "border-rc-moonlight/45 bg-rc-moonlight/12 text-rc-moonlight",
  ember: "border-rc-ember/60 bg-rc-ember/16 text-rc-ember",
  warning: "border-rc-warning/60 bg-rc-warning/14 text-rc-warning-ink",
  danger: "border-rc-danger/60 bg-rc-danger/16 text-rc-danger-ink",
} as const;

export type RcTone = keyof typeof RC_TONE_TINT;

/**
 * realms.cards design-system Button (v2, gold accent).
 * Mirrors ui_kits/web/Button.jsx from the bound design system.
 *
 * Gold rule: the gold `default` fill is reserved for a really important call
 * to action (one per surface). Everything else prefers `outline` (pages) or
 * `quiet` (board/HUD); repeated per-item actions in lists are never gold.
 * - toggles: a non-default variant + `aria-pressed`; `tone` picks the tint.
 *   Gold for neutral selections (view, sort, filter), a semantic tone when
 *   the state means something (on/enabled = success, modes = info, arcane =
 *   moonlight, hidden/muted = warning, armed destructive = danger).
 * - `quiet`: dark chip for HUD/board surfaces (readable over card art)
 * - `danger-soft`: tinted decline/remove action next to a separate primary
 * - `xs` / `icon-xs`: compact in-game sizes (h-7)
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
        "danger-soft":
          "border-rc-danger/40 bg-rc-danger/15 text-rc-danger-ink shadow-none hover:border-rc-danger hover:bg-rc-danger/25",
        outline:
          "border-rc-line/28 bg-transparent text-rc-fg hover:border-rc-accent hover:bg-rc-accent/8 hover:text-rc-fg-strong",
        secondary: "border-rc-line/14 bg-rc-line/6 text-rc-fg hover:bg-rc-line/10",
        quiet:
          "border-rc-line/22 bg-black/35 text-rc-fg-muted shadow-none hover:border-rc-accent hover:text-rc-accent-ring",
        ghost:
          "border-transparent bg-transparent text-rc-fg-muted shadow-none hover:bg-rc-line/6 hover:text-rc-fg",
        link: "border-transparent bg-transparent text-rc-accent-link underline underline-offset-[3px] shadow-none hover:text-rc-accent-hover",
      },
      size: {
        default: "h-[38px] px-[18px] text-sm",
        sm: "h-8 px-3 text-[13px]",
        xs: "h-7 gap-1.5 px-2.5 text-xs",
        lg: "h-[46px] px-[26px] text-base",
        icon: "h-[38px] w-[38px] p-0 text-sm",
        "icon-xs": "h-7 w-7 gap-0 p-0 text-xs",
      },
      /** Tint shown while `aria-pressed` / `data-active="true"` (literal classes for Tailwind's scanner). */
      tone: {
        gold: "aria-pressed:border-rc-accent/60 aria-pressed:bg-rc-accent/14 aria-pressed:text-rc-spark data-[active=true]:border-rc-accent/60 data-[active=true]:bg-rc-accent/14 data-[active=true]:text-rc-spark",
        success:
          "aria-pressed:border-rc-success/60 aria-pressed:bg-rc-success/16 aria-pressed:text-rc-success-ink data-[active=true]:border-rc-success/60 data-[active=true]:bg-rc-success/16 data-[active=true]:text-rc-success-ink",
        info: "aria-pressed:border-rc-info/60 aria-pressed:bg-rc-info/18 aria-pressed:text-rc-info-ink data-[active=true]:border-rc-info/60 data-[active=true]:bg-rc-info/18 data-[active=true]:text-rc-info-ink",
        moonlight:
          "aria-pressed:border-rc-moonlight/45 aria-pressed:bg-rc-moonlight/12 aria-pressed:text-rc-moonlight data-[active=true]:border-rc-moonlight/45 data-[active=true]:bg-rc-moonlight/12 data-[active=true]:text-rc-moonlight",
        ember:
          "aria-pressed:border-rc-ember/60 aria-pressed:bg-rc-ember/16 aria-pressed:text-rc-ember data-[active=true]:border-rc-ember/60 data-[active=true]:bg-rc-ember/16 data-[active=true]:text-rc-ember",
        warning:
          "aria-pressed:border-rc-warning/60 aria-pressed:bg-rc-warning/14 aria-pressed:text-rc-warning-ink data-[active=true]:border-rc-warning/60 data-[active=true]:bg-rc-warning/14 data-[active=true]:text-rc-warning-ink",
        danger:
          "aria-pressed:border-rc-danger/60 aria-pressed:bg-rc-danger/16 aria-pressed:text-rc-danger-ink data-[active=true]:border-rc-danger/60 data-[active=true]:bg-rc-danger/16 data-[active=true]:text-rc-danger-ink",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      tone: "gold",
    },
  },
);

export interface RcButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof rcButtonVariants> {}

export const RcButton = forwardRef<HTMLButtonElement, RcButtonProps>(
  ({ className, variant, size, tone, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(rcButtonVariants({ variant, size, tone, className }))}
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
  tone,
  ...props
}: RcLinkButtonProps) {
  return (
    <Link
      className={cn(rcButtonVariants({ variant, size, tone, className }))}
      {...props}
    />
  );
}
