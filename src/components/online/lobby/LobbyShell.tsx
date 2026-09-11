"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import UserBadge from "@/components/auth/UserBadge";

const NAV_LINKS = [
  { href: "/online/lobby", label: "Lobby" },
  { href: "/tutorial", label: "Tutorial" },
  { href: "/decks", label: "Decks" },
  { href: "/cubes", label: "Cubes" },
  { href: "/tournaments", label: "Tournaments" },
  { href: "/replay", label: "Replays" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/meta", label: "Meta" },
];

/** Optional cross-screen announcement, off unless a text is passed. */
function LobbyMarquee({ text }: { text: string }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 z-20 overflow-hidden"
      style={{ top: "30%" }}
    >
      <pre
        className="inline-block whitespace-pre font-rc-mono text-lg font-bold tracking-[0.18em] text-rc-accent-hover animate-marquee"
        style={{
          animationDuration: "26s",
          textShadow:
            "0 0 8px #e8bf5c, 0 0 16px #e8bf5c, 0 0 28px rgba(0,0,0,0.4)",
        }}
      >
        {text}
      </pre>
    </div>
  );
}

interface LobbyShellProps {
  /** Players currently connected, shown in the nav pill */
  onlineCount: number;
  /** Announcement marquee text; omitted = no marquee (default) */
  marqueeText?: string | null;
  children: ReactNode;
}

/**
 * Full-bleed lobby app shell: grain + vignette floor, sticky top nav with the
 * logo, section links, online pill and the user badge.
 */
export default function LobbyShell({
  onlineCount,
  marqueeText = null,
  children,
}: LobbyShellProps) {
  const pathname = usePathname() ?? "";

  return (
    <div className="rc-lobby relative min-h-screen overflow-x-clip">
      <div aria-hidden="true" className="rc-grain pointer-events-none fixed inset-0 z-0" />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 shadow-[inset_0_0_120px_20px_rgba(0,0,0,0.45)]"
      />
      {marqueeText && <LobbyMarquee text={marqueeText} />}

      <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-rc-line/18 bg-[rgba(7,10,20,0.72)] px-4 py-2.5 backdrop-blur-[6px] sm:gap-7 sm:px-7">
        <Link href="/" className="shrink-0" title="realms.cards home">
          <img
            src="/realms.cards.svg"
            alt="realms.cards"
            className="h-11 w-auto drop-shadow-[0_0_10px_rgba(243,207,106,0.3)]"
          />
        </Link>
        <span
          className="hidden font-rc-mono text-xs text-rc-fg-dim md:inline"
          aria-hidden="true"
        >
          │
        </span>
        <nav className="hidden flex-wrap gap-x-[22px] gap-y-1 font-rc-mono text-xs uppercase tracking-[0.18em] md:flex">
          {NAV_LINKS.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "text-rc-spark [text-shadow:0_0_10px_rgba(253,225,160,0.6)]"
                    : "text-rc-fg-muted transition-colors hover:text-rc-accent-ring"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3 sm:gap-[18px]">
          <div
            className="flex items-center gap-2.5 rounded-rc-md border border-rc-line/22 bg-black/35 px-3 py-1.5 font-rc-mono text-xs uppercase tracking-[0.16em] text-rc-fg-muted"
            title="Players connected to the realm"
          >
            <span className="h-2 w-2 animate-rc-blink bg-rc-success shadow-[0_0_10px_#7a9d52]" />
            <span className="font-semibold tabular-nums text-rc-fg-strong">
              {onlineCount}
            </span>
            online
          </div>
          <UserBadge variant="inline" showPresence={false} />
        </div>
      </header>

      {/* Compact nav for phones (the desktop nav hides below md) */}
      <nav className="relative z-10 flex flex-wrap gap-x-4 gap-y-1 border-b border-rc-line/12 px-4 py-2 font-rc-mono text-[11px] uppercase tracking-[0.18em] md:hidden">
        {NAV_LINKS.map((link) => {
          const active =
            pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={active ? "text-rc-spark" : "text-rc-fg-muted"}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <main className="relative z-10 flex flex-col gap-7 px-4 pb-12 pt-7 sm:px-7">
        {children}
      </main>
    </div>
  );
}
