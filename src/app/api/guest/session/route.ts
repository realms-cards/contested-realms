import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import {
  GUEST_COOKIE_NAME,
  GUEST_NAME_MAX_LENGTH,
  GUEST_NAME_MIN_LENGTH,
  createGuestId,
  guestCookieOptions,
  readGuestSession,
  sanitizeGuestName,
  signGuestCookie,
} from "@/lib/guest/guest-session.server";

export const dynamic = "force-dynamic";

// GET /api/guest/session -> { guest: { id, name } | null }
export async function GET() {
  const session = await getServerAuthSession();
  if (session?.user) {
    // Signing in retires the guest identity for good: leaving the cookie in
    // place would let the guest name resurface (and would come back on sign
    // out), so it is cleared the first time we see an account here.
    const res = NextResponse.json({ guest: null });
    res.cookies.set(GUEST_COOKIE_NAME, "", {
      ...guestCookieOptions(),
      maxAge: 0,
    });
    return res;
  }
  const guest = await readGuestSession();
  return NextResponse.json({ guest });
}

// POST /api/guest/session { name } -> creates (or renames) the guest identity.
// Signed-in users never get a guest cookie: their account is the identity.
export async function POST(req: NextRequest) {
  const session = await getServerAuthSession();
  if (session?.user) {
    return NextResponse.json({ error: "Already signed in" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const name = sanitizeGuestName(body?.name);
  if (!name) {
    return NextResponse.json(
      {
        error: `Pick a name between ${GUEST_NAME_MIN_LENGTH} and ${GUEST_NAME_MAX_LENGTH} characters`,
      },
      { status: 400 },
    );
  }

  // Keep the id stable across renames so an in-progress lobby seat survives
  const existing = await readGuestSession();
  const guest = { id: existing?.id ?? createGuestId(), name };
  const token = signGuestCookie(guest);
  if (!token) {
    console.error("[guest/session] NEXTAUTH_SECRET not configured");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const res = NextResponse.json({ guest });
  res.cookies.set(GUEST_COOKIE_NAME, token, guestCookieOptions());
  return res;
}

// DELETE /api/guest/session -> clears the guest identity
export async function DELETE() {
  const res = NextResponse.json({ guest: null });
  res.cookies.set(GUEST_COOKIE_NAME, "", {
    ...guestCookieOptions(),
    maxAge: 0,
  });
  return res;
}
