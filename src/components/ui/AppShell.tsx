"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useContext, useEffect, useRef, type ReactNode } from "react";
import { OnlineContext } from "@/app/online/online-context";
import UserBadge from "@/components/auth/UserBadge";
import { cn } from "@/lib/utils";

export const APP_NAV_LINKS = [
  { href: "/online/lobby", label: "Lobby" },
  { href: "/tutorial", label: "Tutorial" },
  { href: "/decks", label: "Decks" },
  { href: "/collection", label: "Collection" },
  { href: "/cubes", label: "Cubes" },
  { href: "/tournaments", label: "Tournaments" },
  { href: "/replay", label: "Replays" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/meta", label: "Meta" },
] as const;

export function isNavActive(pathname: string, href: string): boolean {
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  // Open events live next to the Swiss tournaments in the nav
  return href === "/tournaments" && pathname.startsWith("/open-tournaments");
}

/** Optional cross-screen announcement, off unless a text is passed. */
function AppMarquee({ text }: { text: string }) {
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

const WIDTHS = {
  /** Edge to edge (the lobby) */
  full: "",
  /** Standard content column */
  wide: "mx-auto w-full max-w-6xl",
  /** Prose column (terms, privacy, single forms) */
  narrow: "mx-auto w-full max-w-3xl",
} as const;

export interface AppShellProps {
  children: ReactNode;
  /** Content column width; defaults to the standard column */
  width?: keyof typeof WIDTHS;
  /** Override the online count (defaults to the online context's player list) */
  onlineCount?: number;
  /** Announcement marquee text; omitted = no marquee (default) */
  marqueeText?: string | null;
  /** Hide the top navigation (rare: focused flows) */
  showNav?: boolean;
  /** Extra classes for the <main> content column */
  className?: string;
}

/**
 * Site-wide app shell from the realms.cards design system: grain + vignette
 * floor, sticky top nav with the logo, section links, online pill and the
 * user badge, then a vertical content column.
 */
export default function AppShell({
  children,
  width = "wide",
  onlineCount,
  marqueeText = null,
  showNav = true,
  className,
}: AppShellProps) {
  const pathname = usePathname() ?? "";
  const online = useContext(OnlineContext);
  const count = onlineCount ?? online?.players.length ?? 0;
  const navRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  // Publish the live header height as --rc-nav-h so full-screen children
  // (tutorial lessons, game overlays) can sit just below it at every width.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const header = headerRef.current;
    if (!showNav || !header) {
      root.style.setProperty("--rc-nav-h", "0px");
      return;
    }
    const publish = () =>
      root.style.setProperty(
        "--rc-nav-h",
        `${Math.round(header.getBoundingClientRect().height)}px`,
      );
    publish();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    return () => observer.disconnect();
  }, [showNav]);

  // On narrow screens the links scroll horizontally; bring the current
  // section into view so e.g. "Leaderboard" is not hidden off the edge.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active) return;
    const target =
      active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
    nav.scrollLeft = Math.max(0, target);
  }, [pathname]);

  return (
    <div ref={rootRef} className="rc-app relative min-h-screen overflow-x-clip">
      <div
        aria-hidden="true"
        className="rc-grain pointer-events-none fixed inset-0 z-0"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 shadow-[inset_0_0_120px_20px_rgba(0,0,0,0.45)]"
      />
      {marqueeText && <AppMarquee text={marqueeText} />}

      {showNav && (
        /*
         * One row at every width. Below lg (phones, portrait and landscape,
         * and small tablets) the wordmark becomes the skull icon, the links
         * become a single horizontally scrolling strip and the online pill
         * drops its label, so the header stays one slim bar instead of
         * wrapping into several rows.
         */
        <header ref={headerRef} className="sticky top-0 z-30 flex items-center gap-3 border-b border-rc-line/18 bg-[rgba(7,10,20,0.72)] py-1.5 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] backdrop-blur-[6px] lg:gap-7 lg:px-7 lg:py-2.5">
          <Link href="/" className="shrink-0" title="realms.cards home">
            <img
              src="/icons/icon-192.png"
              alt="realms.cards"
              width={28}
              height={28}
              className="h-7 w-7 drop-shadow-[0_0_8px_rgba(243,207,106,0.3)] lg:hidden"
            />
            <img
              src="/realms.cards.svg"
              alt="realms.cards"
              className="hidden h-11 w-auto drop-shadow-[0_0_10px_rgba(243,207,106,0.3)] lg:block"
            />
          </Link>
          <span
            className="hidden font-rc-mono text-xs text-rc-fg-dim lg:inline"
            aria-hidden="true"
          >
            │
          </span>
          <nav
            ref={navRef}
            className="flex min-w-0 flex-1 gap-x-4 overflow-x-auto whitespace-nowrap font-rc-mono text-[11px] uppercase tracking-[0.14em] [mask-image:linear-gradient(to_right,transparent,#000_12px,#000_calc(100%-16px),transparent)] [scrollbar-width:none] lg:flex-none lg:flex-wrap lg:gap-x-[22px] lg:gap-y-1 lg:overflow-visible lg:whitespace-normal lg:text-xs lg:tracking-[0.18em] lg:[mask-image:none] [&::-webkit-scrollbar]:hidden"
          >
            {APP_NAV_LINKS.map((link) => {
              const active = isNavActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "shrink-0 py-1.5 first:pl-3 last:pr-4 lg:py-0 lg:first:pl-0 lg:last:pr-0",
                    active
                      ? "text-rc-spark [text-shadow:0_0_10px_rgba(253,225,160,0.6)]"
                      : "text-rc-fg-muted transition-colors hover:text-rc-accent-ring",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2.5 lg:gap-[18px]">
            <div
              className="flex items-center gap-1.5 rounded-rc-md border border-rc-line/22 bg-black/35 px-2 py-1 font-rc-mono text-[11px] uppercase tracking-[0.16em] text-rc-fg-muted lg:gap-2.5 lg:px-3 lg:py-1.5 lg:text-xs"
              title="Players connected to the realm"
            >
              <span className="h-1.5 w-1.5 animate-rc-blink bg-rc-success shadow-[0_0_10px_#7a9d52] lg:h-2 lg:w-2" />
              <span className="font-semibold tabular-nums text-rc-fg-strong">
                {count}
              </span>
              <span className="hidden lg:inline">online</span>
            </div>
            <UserBadge variant="inline" showPresence={false} />
          </div>
        </header>
      )}

      <main
        className={cn(
          "relative z-10 flex flex-col gap-7 px-4 pb-12 pt-7 sm:px-7",
          WIDTHS[width],
          className,
        )}
      >
        {children}
      </main>
    </div>
  );
}
