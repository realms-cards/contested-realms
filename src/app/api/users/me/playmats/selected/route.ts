import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ALLOWED_STANDARD_KEYS = ["default"] as const;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function requireAuthenticatedUser(): Promise<{
  id: string;
  selectedPlaymatRef: string | null;
  isPatron: boolean;
} | null> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return null;

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, patronTier: true, selectedPlaymatRef: true },
  });

  if (!me?.id) return null;

  return {
    id: me.id,
    selectedPlaymatRef: me.selectedPlaymatRef ?? null,
    isPatron: Boolean(me.patronTier),
  };
}

function isValidStandardRef(ref: string): boolean {
  if (!ref.startsWith("standard:")) return false;
  const key = ref.slice("standard:".length);
  return (ALLOWED_STANDARD_KEYS as readonly string[]).includes(key);
}

export async function GET(): Promise<Response> {
  try {
    const me = await requireAuthenticatedUser();
    // Return null for unauthenticated - client uses default playmat
    // Using 200 instead of 401 avoids noisy console errors for regular users
    if (!me) return json({ selectedPlaymatRef: null });
    // Return the selected playmat ref regardless of patron status
    // If they have a custom playmat from when they were a patron, they should still see it
    return json({ selectedPlaymatRef: me.selectedPlaymatRef });
  } catch (e: unknown) {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
          ? e
          : "Unknown error";
    return json({ error: message }, 500);
  }
}

export async function PATCH(req: NextRequest): Promise<Response> {
  try {
    const me = await requireAuthenticatedUser();
    if (!me) return json({ error: "Unauthorized" }, 401);
    // Require patron status to modify playmat selection
    if (!me.isPatron) return json({ error: "Patron status required" }, 403);

    const body = await req.json().catch(() => ({}));
    const refRaw =
      typeof body?.selectedPlaymatRef === "string"
        ? String(body.selectedPlaymatRef).trim()
        : body?.selectedPlaymatRef === null
          ? null
          : undefined;

    if (typeof refRaw === "undefined") {
      return json({ error: 'Missing "selectedPlaymatRef"' }, 400);
    }

    if (refRaw === null || refRaw === "") {
      const updated = await prisma.user.update({
        where: { id: me.id },
        data: { selectedPlaymatRef: null },
        select: { selectedPlaymatRef: true },
      });
      return json({
        ok: true,
        selectedPlaymatRef: updated.selectedPlaymatRef ?? null,
      });
    }

    if (isValidStandardRef(refRaw)) {
      const updated = await prisma.user.update({
        where: { id: me.id },
        data: { selectedPlaymatRef: refRaw },
        select: { selectedPlaymatRef: true },
      });
      return json({
        ok: true,
        selectedPlaymatRef: updated.selectedPlaymatRef ?? null,
      });
    }

    if (refRaw.startsWith("custom:")) {
      const playmatId = refRaw.slice("custom:".length);
      if (!playmatId) return json({ error: "Invalid custom playmat ref" }, 400);

      const exists = await prisma.customPlaymat.findFirst({
        where: { id: playmatId, userId: me.id },
        select: { id: true },
      });

      if (!exists) return json({ error: "Playmat not found" }, 404);

      const updated = await prisma.user.update({
        where: { id: me.id },
        data: { selectedPlaymatRef: refRaw },
        select: { selectedPlaymatRef: true },
      });
      return json({
        ok: true,
        selectedPlaymatRef: updated.selectedPlaymatRef ?? null,
      });
    }

    return json({ error: "Invalid selectedPlaymatRef" }, 400);
  } catch (e: unknown) {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
          ? e
          : "Unknown error";
    return json({ error: message }, 500);
  }
}
