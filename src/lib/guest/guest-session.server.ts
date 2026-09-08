/**
 * Guest sessions - account-less players joining a match through an invite link.
 *
 * The guest identity lives in a signed, httpOnly cookie. /api/socket-token
 * turns it into a socket JWT carrying `guest: true`, and the socket server
 * skips every User-table lookup for ids with the `guest_` prefix.
 */

import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

export const GUEST_COOKIE_NAME = "realms_guest";
export const GUEST_PLAYER_ID_PREFIX = "guest_";
export const GUEST_NAME_MIN_LENGTH = 2;
export const GUEST_NAME_MAX_LENGTH = 24;
const GUEST_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface GuestSession {
  id: string;
  name: string;
}

interface GuestCookiePayload {
  guestId?: unknown;
  name?: unknown;
  guest?: unknown;
}

export function isGuestPlayerId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(GUEST_PLAYER_ID_PREFIX);
}

/** Trim, collapse whitespace, strip control characters; null when unusable. */
export function sanitizeGuestName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, GUEST_NAME_MAX_LENGTH);
  return cleaned.length >= GUEST_NAME_MIN_LENGTH ? cleaned : null;
}

export function createGuestId(): string {
  return `${GUEST_PLAYER_ID_PREFIX}${randomBytes(12).toString("hex")}`;
}

function getSecret(): string | null {
  return process.env.NEXTAUTH_SECRET || null;
}

export function signGuestCookie(session: GuestSession): string | null {
  const secret = getSecret();
  if (!secret) return null;
  return jwt.sign(
    { guestId: session.id, name: session.name, guest: true },
    secret,
    { expiresIn: GUEST_SESSION_TTL_SECONDS },
  );
}

export function verifyGuestCookie(token: string): GuestSession | null {
  const secret = getSecret();
  if (!secret || !token) return null;
  try {
    const payload = jwt.verify(token, secret) as GuestCookiePayload;
    if (payload.guest !== true) return null;
    const id = typeof payload.guestId === "string" ? payload.guestId : null;
    const name = sanitizeGuestName(payload.name);
    if (!id || !isGuestPlayerId(id) || !name) return null;
    return { id, name };
  } catch {
    return null;
  }
}

export async function readGuestSession(): Promise<GuestSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(GUEST_COOKIE_NAME)?.value;
  return token ? verifyGuestCookie(token) : null;
}

export function guestCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_SESSION_TTL_SECONDS,
  };
}
