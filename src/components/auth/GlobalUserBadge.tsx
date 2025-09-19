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
  const isOnline = pathname?.startsWith("/online");
  if (isOnline) return null;
  return <UserBadge variant="floating" />;
}
