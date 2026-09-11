"use client";

import { useSession } from "next-auth/react";
import { useMemo } from "react";
import { useGuestSession } from "@/lib/guest/guestSession";

/**
 * The person looking at the page: a signed-in account, or - only once NextAuth
 * has definitively said there is none - the guest identity from an invite
 * link. Pages that guests may use read their identity from here instead of
 * `useSession()` so every `playerId === viewer.id` comparison keeps working.
 */
export interface Viewer {
  /** "loading" until both NextAuth and the guest cookie have been checked */
  status: "loading" | "ready";
  id: string | null;
  name: string | null;
  isGuest: boolean;
  /** No account and no guest identity: show a sign-in / guest gate */
  isAnonymous: boolean;
}

export function useViewer(): Viewer {
  const { data: session, status: sessionStatus } = useSession();
  const guest = useGuestSession();
  const userId = (session?.user as { id?: string | null } | undefined)?.id ?? null;
  const userName = session?.user?.name ?? null;
  const guestId = guest.status === "ready" ? (guest.guest?.id ?? null) : null;
  const guestName = guest.status === "ready" ? (guest.guest?.name ?? null) : null;

  return useMemo<Viewer>(() => {
    if (sessionStatus === "authenticated" && userId) {
      return { status: "ready", id: userId, name: userName, isGuest: false, isAnonymous: false };
    }
    if (sessionStatus === "unauthenticated" && guest.status === "ready") {
      return guestId
        ? { status: "ready", id: guestId, name: guestName, isGuest: true, isAnonymous: false }
        : { status: "ready", id: null, name: null, isGuest: false, isAnonymous: true };
    }
    return { status: "loading", id: null, name: null, isGuest: false, isAnonymous: false };
  }, [sessionStatus, userId, userName, guest.status, guestId, guestName]);
}
