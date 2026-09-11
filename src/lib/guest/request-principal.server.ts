/**
 * Who is making this request: a signed-in account, or an invite-link guest.
 *
 * Routes that guests may use call `getRequestPrincipal()` instead of
 * `getServerAuthSession()`. Guests have no User row by default; the first time
 * one touches a table with a User foreign key (tournament registrations,
 * standings, draft seats, decks) the route calls `ensureGuestUser()` to create
 * the shadow row - flagged `isGuest` so it stays out of user listings.
 */

import { getServerAuthSession } from "@/lib/auth";
import { readGuestSession } from "@/lib/guest/guest-session.server";
import { prisma } from "@/lib/prisma";

export interface RequestPrincipal {
  id: string;
  name: string | null;
  isGuest: boolean;
}

export async function getRequestPrincipal(): Promise<RequestPrincipal | null> {
  const session = await getServerAuthSession();
  const user = session?.user as { id?: string; name?: string | null } | undefined;
  if (user?.id) {
    return { id: user.id, name: user.name ?? null, isGuest: false };
  }
  const guest = await readGuestSession();
  return guest ? { id: guest.id, name: guest.name, isGuest: true } : null;
}

/** Create/refresh the shadow User row a guest needs before any FK write. */
export async function ensureGuestUser(
  principal: RequestPrincipal,
): Promise<void> {
  if (!principal.isGuest) return;
  await prisma.user.upsert({
    where: { id: principal.id },
    create: {
      id: principal.id,
      name: principal.name,
      isGuest: true,
      presenceHidden: true,
    },
    update: { name: principal.name },
  });
}
