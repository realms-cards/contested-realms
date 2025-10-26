"use client";

import { usePathname } from "next/navigation";
import UserBadge from "@/components/auth/UserBadge";
 

/**
 * GlobalUserBadge
 * Renders a floating `UserBadge` on all pages except under `/online/*`
 * to avoid duplicating the lobby header's badge.
 */
export default function GlobalUserBadge() {
  const pathname = usePathname();
  const isOnlineSection = pathname?.startsWith("/online");
  if (isOnlineSection) return null;

  // Hide on a few static sections where the floating badge is distracting
  if (
    pathname &&
    (pathname.startsWith("/replay") ||
      pathname.startsWith("/leaderboard") ||
      pathname.startsWith("/decks") ||
      pathname.startsWith("/cubes"))
  ) {
    return null;
  }

  // Previously: only show presence on editor-3d routes when outside /online
  const wantsPresence = Boolean(pathname && pathname.includes("editor-3d"));

  return <UserBadge variant="floating" showPresence={wantsPresence} />;
}
