"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import UserBadge from "@/components/auth/UserBadge";
import {
  getUserBadgeServerSnapshot,
  getUserBadgeSnapshot,
  subscribeToUserBadges,
} from "@/components/auth/userBadgePresence";

/**
 * GlobalUserBadge
 * Floating user badge for the surfaces that place none of their own: pages
 * outside the site shell that are not full-screen game screens. When any other
 * UserBadge is mounted - the AppShell nav, the match HUD, a draft screen, the
 * 3D deck editor - this one stands down instead of stacking a second avatar
 * in the same corner.
 */
export default function GlobalUserBadge() {
  const pathname = usePathname() ?? "";
  const pageHasBadge = useSyncExternalStore(
    subscribeToUserBadges,
    getUserBadgeSnapshot,
    getUserBadgeServerSnapshot,
  );

  if (pageHasBadge) return null;

  // Presence matters where the player may be mid-match or mid-edit
  const wantsPresence =
    pathname.includes("editor-3d") ||
    pathname.startsWith("/online/") ||
    pathname.startsWith("/play");

  return (
    <UserBadge
      variant="floating"
      showPresence={wantsPresence}
      announcePresence={false}
    />
  );
}
