"use client";

import React from "react";
import AsciiPanel from "@/components/ui/AsciiPanel";

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
    disabledReason: "Invite URL needed (please provide)",
  },
  {
    label: "Sorcery League — Official Discord",
    href: "https://discord.gg/YSAa5E82",
    subtitle: "Organized play, leagues, and events",
    disabledReason: "Invite URL needed (please provide)",
  },
  {
    label: "Sorcerers at the Core",
    href: "https://www.sorcerersatthecore.com/",
    subtitle: "Community-driven content and discussion",
    disabledReason: "Invite URL needed (please provide)",
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
];

export default function OtherRealms({
  className = "",
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
      <AsciiPanel>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full group block hover:scale-[1.01] transition-transform duration-200"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="other-realms-overlay"
        >
          <div className="flex items-center justify-center py-5">
            <h3 className="text-xl md:text-2xl font-semibold tracking-wide">
              {title}
            </h3>
          </div>
        </button>
      </AsciiPanel>

      {open && (
        <div
          id="other-realms-overlay"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onMouseDown={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-2xl bg-slate-900/95 text-white rounded-xl border border-slate-700 shadow-2xl overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
              <div className="flex items-start flex-col">
                <h2 className="text-lg md:text-xl font-semibold">{title}</h2>
                <p className="text-xs text-slate-400">
                  Discover official and community projects
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-3 text-slate-300 hover:text-white rounded-md px-2 py-1 border border-transparent hover:border-slate-600"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Optional Linktree CTA */}
            {linktreeUrl && (
              <div className="px-5 pt-4">
                <a
                  href={linktreeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-emerald-300 hover:text-emerald-200 hover:underline"
                >
                  <span>Open Linktree</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="w-4 h-4"
                    aria-hidden
                  >
                    <path d="M18 13a1 1 0 0 0-1 1v3H6V7h3a1 1 0 1 0 0-2H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1Zm3-10h-6a1 1 0 1 0 0 2h3.586l-8.293 8.293a1 1 0 1 0 1.414 1.414L20 6.414V10a1 1 0 1 0 2 0V3a1 1 0 0 0-1-1Z" />
                  </svg>
                </a>
              </div>
            )}

            {/* Links */}
            <div className="px-5 py-4">
              <ul className="space-y-3">
                {links.map((link) => {
                  const isDisabled = link.href === "#" || link.disabledReason;
                  return (
                    <li key={link.label}>
                      {isDisabled ? (
                        <div
                          className="w-full px-4 py-3 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-400 cursor-not-allowed text-center"
                          title={link.disabledReason || "Coming soon"}
                        >
                          <div className="font-medium">{link.label}</div>
                          {link.subtitle && (
                            <div className="text-xs opacity-80">
                              {link.subtitle}
                            </div>
                          )}
                        </div>
                      ) : (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-full pl-4 pr-10 py-3 rounded-lg border border-slate-700 bg-slate-800/70 hover:bg-slate-700/70 transition-colors group relative"
                        >
                          <div className="text-center">
                            <div className="font-medium group-hover:underline">
                              {link.label}
                            </div>
                            {link.subtitle && (
                              <div className="text-xs text-slate-300/80">
                                {link.subtitle}
                              </div>
                            )}
                          </div>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="w-5 h-5 text-slate-300 group-hover:text-white absolute right-3 top-1/2 -translate-y-1/2"
                            aria-hidden
                          >
                            <path d="M14 3a1 1 0 1 0 0 2h3.586l-9.293 9.293a1 1 0 0 0 1.414 1.414L19 6.414V10a1 1 0 1 0 2 0V3a1 1 0 0 0-1-1h-6ZM5 6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6a1 1 0 1 0-2 0v5H6V8h5a1 1 0 1 0 0-2H5Z" />
                          </svg>
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-700/60">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 rounded-md border border-slate-600 text-slate-200 hover:bg-slate-700/70"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
