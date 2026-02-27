import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import UserBadge from "@/components/auth/UserBadge";

interface OnlinePageShellProps {
  children: ReactNode;
  className?: string;
  showNav?: boolean;
}

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/online/lobby", label: "Lobby" },
  { href: "/tutorial", label: "Tutorial" },
  { href: "/decks", label: "Decks" },
  { href: "/cubes", label: "Cubes" },
  { href: "/tournaments", label: "Tournaments" },
  { href: "/replay", label: "Replays" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/meta", label: "Meta" },
];

export default function OnlinePageShell({
  children,
  className,
  showNav = true,
}: OnlinePageShellProps) {
  const pathname = usePathname();

  const containerClassName = `max-w-5xl mx-auto px-6 py-8 space-y-6${
    className ? ` ${className}` : ""
  }`;

  // Get the current route title based on pathname
  const getRouteTitle = (path: string) => {
    if (path.startsWith("/settings")) return "Settings";
    for (const link of NAV_LINKS) {
      if (path === link.href || path.startsWith(`${link.href}/`)) {
        return link.label;
      }
    }
    return "Online Play"; // fallback
  };

  // Filter out the current page from navigation links
  const visibleNavLinks = NAV_LINKS.filter(
    (link) =>
      !(
        (pathname || "") === link.href ||
        (pathname || "").startsWith(`${link.href}/`)
      )
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100">
      <div className={containerClassName}>
        {showNav && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold font-fantaisie">
                {getRouteTitle(pathname || "")}
              </h1>
              {visibleNavLinks.map((link, index) => {
                const active = pathname
                  ? pathname === link.href ||
                    pathname.startsWith(`${link.href}/`)
                  : false;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`${
                      index === 0 ? "ml-2" : ""
                    } text-xs underline transition-colors ${
                      active
                        ? "text-slate-100"
                        : "text-slate-300/80 hover:text-slate-200"
                    }`}
                    aria-current={active ? "page" : undefined}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
            <UserBadge />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
