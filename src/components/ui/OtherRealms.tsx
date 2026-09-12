"use client";

import React from "react";
import PanelTile from "@/components/ui/panel-tile";
import { RcButton } from "@/components/ui/rc-button";
import { RcDialog } from "@/components/ui/rc-dialog";

export type OtherRealmsLink = {
  label: string;
  href: string;
  subtitle?: string;
  disabledReason?: string;
};

export type OtherRealmsProps = {
  className?: string;
  links?: OtherRealmsLink[];
  /** Optional external Linktree URL (opens in new tab) */
  linktreeUrl?: string | null;
  /** Optional title override */
  title?: string;
};

const DEFAULT_LINKS: OtherRealmsLink[] = [
  {
    label: "Curiosa — Official Site",
    href: "https://curiosa.io",
    subtitle: "The official home of Sorcery: Contested Realm",
  },
  {
    label: "Sorcery Official Discord",
    href: "https://discord.gg/qvYVGFAS5n",
    subtitle: "Community, announcements, and rules discussions",
  },
  {
    label: "Sorcery League — Official Discord",
    href: "https://discord.gg/YSAa5E82",
    subtitle: "Organized play, leagues, and events",
  },
  {
    label: "Sorcerers at the Core",
    href: "https://www.sorcerersatthecore.com/",
    subtitle: "Community-driven content and discussion",
  },
  {
    label: "The Ruby Core-ier",
    href: "https://www.patreon.com/c/therubycoreier",
    subtitle: "A Uniquely retro magazine for every Avatar in the realm",
  },
  {
    label: "Trolls of the Realm",
    href: "https://trollsoftherealm.com/",
    subtitle: "Buy and sell single cards (Europe)",
  },
  {
    label: "TCGPlayer",
    href: "https://www.tcgplayer.com/search/sorcery-contested-realm/product?productLineName=sorcery-contested-realm&view=grid",
    subtitle: "Buy and sell single cards (US)",
  },
  {
    label: "Sorcery.market",
    href: "https://sorcery.market/",
    subtitle: "Live card market data",
  },
  {
    label: "The Painted Realm",
    href: "https://www.thepaintedrealm.com/",
    subtitle: "Celebrating the Art Behind Sorcery",
  },
  {
    label: "CardNexus",
    href: "https://cardnexus.com/",
    subtitle: "Your Cards, Your Rules. Collect, Trade, Connect.",
  },
];

export default function OtherRealms({
  className = "cursor-pointer",
  links = DEFAULT_LINKS,
  linktreeUrl = null,
  title = "Other Realms",
}: OtherRealmsProps) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Prevent body scroll when the overlay is open
  React.useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
    return undefined;
  }, [open]);

  return (
    <div className={className}>
      <PanelTile>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="block w-full cursor-pointer"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="other-realms-overlay"
        >
          <div className="flex items-center justify-center py-3 md:py-4">
            <h4 className="m-0 font-rc-display text-[22px] leading-none text-rc-fg-strong">
              {title}
            </h4>
          </div>
        </button>
      </PanelTile>

      {open && (
        <RcDialog
          title={title}
          eyebrow="official & community"
          onClose={() => setOpen(false)}
          size="lg"
          actions={
            <RcButton variant="outline" onClick={() => setOpen(false)}>
              Close
            </RcButton>
          }
        >
          {linktreeUrl && (
            <a
              href={linktreeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rc-link mb-4 inline-flex items-center gap-2 text-sm"
            >
              Open Linktree ↗
            </a>
          )}
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {links.map((link) => {
              const isDisabled = link.href === "#" || link.disabledReason;
              return (
                <li key={link.label} className="h-full">
                  {isDisabled ? (
                    <div
                      className="flex h-full w-full cursor-not-allowed flex-col justify-center rounded-rc-md border border-rc-line/12 bg-black/30 px-4 py-3 text-center text-rc-fg-dim"
                      title={link.disabledReason || "Coming soon"}
                    >
                      <div className="font-rc-sans text-sm font-medium">
                        {link.label}
                      </div>
                      {link.subtitle && (
                        <div className="mt-0.5 font-rc-mono text-[11px] tracking-[0.06em]">
                          {link.subtitle}
                        </div>
                      )}
                    </div>
                  ) : (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative block h-full w-full rounded-rc-md border border-rc-line/14 bg-rc-line/6 py-3 pl-4 pr-10 transition-[border-color,background-color] hover:border-rc-accent hover:bg-rc-accent/8"
                    >
                      <div className="text-center">
                        <div className="font-rc-sans text-sm font-medium text-rc-fg-strong group-hover:text-rc-accent-ring">
                          {link.label}
                        </div>
                        {link.subtitle && (
                          <div className="mt-0.5 font-rc-mono text-[11px] tracking-[0.06em] text-rc-fg-subtle">
                            {link.subtitle}
                          </div>
                        )}
                      </div>
                      <span
                        className="absolute right-3 top-1/2 -translate-y-1/2 font-rc-mono text-rc-fg-dim transition-colors group-hover:text-rc-accent-ring"
                        aria-hidden="true"
                      >
                        ↗
                      </span>
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </RcDialog>
      )}
    </div>
  );
}
