import "server-only";

import type { Session } from "next-auth";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

const isProduction = process.env.NODE_ENV === "production";
const allowDevFallback = !isProduction;

function parseList(envKey: string): string[] {
  const raw = process.env[envKey];
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const ADMIN_USER_IDS = parseList("ADMIN_USER_IDS");
const ADMIN_EMAILS = parseList("ADMIN_EMAILS").map((email) =>
  email.toLowerCase()
);

export class AdminAccessError extends Error {
  constructor(message = "Administrator access required") {
    super(message);
    this.name = "AdminAccessError";
  }
}

export function isAdminSession(session: Session | null | undefined): boolean {
  const userIdsConfigured = ADMIN_USER_IDS.length > 0;
  const emailsConfigured = ADMIN_EMAILS.length > 0;
  const devFallbackEnabled = allowDevFallback && !userIdsConfigured && !emailsConfigured;

  if (!session?.user) {
    return devFallbackEnabled;
  }

  const userId = (session.user as { id?: string }).id;
  const emailRaw =
    (session.user as { email?: string | null }).email ?? undefined;
  const email = typeof emailRaw === "string" ? emailRaw.toLowerCase() : null;

  if (!userIdsConfigured && !emailsConfigured) {
    return devFallbackEnabled;
  }

  if (userId && ADMIN_USER_IDS.includes(userId)) {
    return true;
  }

  if (email && ADMIN_EMAILS.includes(email)) {
    return true;
  }

  return false;
}

export async function getAdminSession(): Promise<{
  session: Session | null;
  isAdmin: boolean;
}> {
  const session = await getServerSession(authOptions);
  return {
    session,
    isAdmin: isAdminSession(session),
  };
}

export async function requireAdminSession(): Promise<Session> {
  const { session, isAdmin } = await getAdminSession();
  if (!session) {
    const userIdsConfigured = ADMIN_USER_IDS.length > 0;
    const emailsConfigured = ADMIN_EMAILS.length > 0;
    const devFallbackEnabled =
      allowDevFallback && !userIdsConfigured && !emailsConfigured;
    if (devFallbackEnabled) {
      const devSession: Session = {
        user: {
          id: "dev-admin",
          name: "Developer Admin",
          email: null,
          image: null,
        },
        expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      };
      return devSession;
    }
  }
  if (!session || !isAdmin) {
    throw new AdminAccessError();
  }
  return session;
}
