import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_DISPLAY_NAME_LENGTH = 40;
const MAX_AVATAR_BYTES = 512 * 1024; // 512KB
const ALLOWED_AVATAR_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function parseAvatarDataUrl(input: string) {
  const match = input.match(/^data:(image\/(png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) {
    throw new Error("Avatar must be a valid base64 data URL (PNG, JPEG, or WebP).");
  }
  const mime = match[1].toLowerCase();
  if (!ALLOWED_AVATAR_MIME.has(mime)) {
    throw new Error("Avatar must be a PNG, JPEG, or WebP image.");
  }
  const base64 = match[3];
  const byteLength = Buffer.byteLength(base64, "base64");
  if (byteLength > MAX_AVATAR_BYTES) {
    throw new Error("Avatar must be smaller than 512KB.");
  }
  return `data:${mime};base64,${base64}`;
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Payload must be an object." }, { status: 400 });
    }

    const { displayName, avatar, email } = body as {
      displayName?: unknown;
      avatar?: unknown;
      email?: unknown;
    };

    const existingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!existingUser) {
      return NextResponse.json({ error: "User account not found." }, { status: 404 });
    }

    const data: {
      name?: string | null;
      image?: string | null;
      email?: string | null;
      emailVerified?: Date | null;
    } = {};
    let emailChanged = false;

    if (displayName !== undefined) {
      if (displayName !== null && typeof displayName !== "string") {
        return NextResponse.json({ error: "Display name must be a string." }, { status: 400 });
      }
      const normalized = displayName === null ? "" : normalizeWhitespace(displayName);
      if (normalized.length > MAX_DISPLAY_NAME_LENGTH) {
        return NextResponse.json({
          error: `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`,
        }, { status: 400 });
      }
      data.name = normalized.length === 0 ? null : normalized;
    }

    if (avatar !== undefined) {
      if (avatar !== null && typeof avatar !== "string") {
        return NextResponse.json({ error: "Avatar must be null or a string (data URL)." }, { status: 400 });
      }
      if (typeof avatar === "string" && avatar.trim().length > 0) {
        try {
          data.image = parseAvatarDataUrl(avatar.trim());
        } catch (error) {
          return NextResponse.json({ error: (error as Error).message }, { status: 400 });
        }
      } else {
        data.image = null;
      }
    }

    if (email !== undefined) {
      if (email !== null && typeof email !== "string") {
        return NextResponse.json({ error: "Email must be a string or null." }, { status: 400 });
      }
      let normalizedEmail: string | null = null;
      if (typeof email === "string") {
        const trimmed = email.trim();
        if (trimmed.length > 0) {
          normalizedEmail = normalizeEmail(trimmed);
          if (!EMAIL_REGEX.test(normalizedEmail)) {
            return NextResponse.json({ error: "Email address is not valid." }, { status: 400 });
          }
        }
      }

      const currentEmail = existingUser.email ? normalizeEmail(existingUser.email) : null;

      if (normalizedEmail !== currentEmail) {
        if (normalizedEmail) {
          const conflict = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
          if (conflict && conflict.id !== userId) {
            return NextResponse.json({
              error: "That email is already in use by another account.",
            }, { status: 409 });
          }
        }
        data.email = normalizedEmail;
        data.emailVerified = null;
        emailChanged = true;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No profile changes provided." }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        image: true,
        email: true,
        emailVerified: true,
      },
    });

    return NextResponse.json({
      success: true,
      emailChanged,
      user: {
        id: updated.id,
        name: updated.name,
        image: updated.image,
        email: updated.email,
        emailVerified: updated.emailVerified,
      },
    });
  } catch (error) {
    console.error("/api/profile PATCH failed", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        image: true,
        email: true,
        emailVerified: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User account not found." }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        image: user.image,
        email: user.email,
        emailVerified: user.emailVerified ? user.emailVerified.toISOString() : null,
      },
    });
  } catch (error) {
    console.error("/api/profile GET failed", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}
