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

async function requirePatronUser(): Promise<{
  id: string;
  selectedPlaymatRef: string | null;
} | null> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return null;

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, patronTier: true, selectedPlaymatRef: true },
  });

  if (!me?.id) return null;
  if (!me.patronTier) return null;

  return {
    id: me.id,
    selectedPlaymatRef: me.selectedPlaymatRef ?? null,
  };
}

function isValidStandardRef(ref: string): boolean {
  if (!ref.startsWith("standard:")) return false;
  const key = ref.slice("standard:".length);
  return (ALLOWED_STANDARD_KEYS as readonly string[]).includes(key);
}

export async function GET(): Promise<Response> {
  try {
    const me = await requirePatronUser();
    // Return null for non-patrons/unauthenticated - client uses default playmat
    // Using 200 instead of 401 avoids noisy console errors for regular users
    if (!me) return json({ selectedPlaymatRef: null });
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
    const me = await requirePatronUser();
    if (!me) return json({ error: "Unauthorized" }, 401);

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
