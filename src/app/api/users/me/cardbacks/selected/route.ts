import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { isSleevePreset } from "@/lib/game/sleevePresets";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function GET(): Promise<Response> {
  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) return json({ error: "Unauthorized" }, 401);

    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { selectedCardbackRef: true },
    });

    return json({ selectedCardbackRef: me?.selectedCardbackRef ?? null });
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
    const session = await getServerAuthSession();
    if (!session?.user?.id) return json({ error: "Unauthorized" }, 401);

    // Check patron status
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, patronTier: true },
    });

    if (!me?.patronTier) return json({ error: "Patron access required" }, 403);

    const body = await req.json().catch(() => ({}));
    const ref = body?.selectedCardbackRef;

    // Allow null/undefined to clear selection, or "standard:default", "custom:<id>", or "preset:<id>"
    let newRef: string | null = null;

    if (ref === null || ref === undefined || ref === "standard:default") {
      newRef = null;
    } else if (typeof ref === "string" && ref.startsWith("custom:")) {
      const customId = ref.slice("custom:".length);
      // Verify the custom cardback exists and belongs to this user
      const found = await prisma.customCardback.findFirst({
        where: { id: customId, userId: session.user.id },
        select: { id: true },
      });
      if (!found) return json({ error: "Custom cardback not found" }, 404);
      newRef = ref;
    } else if (typeof ref === "string" && isSleevePreset(ref)) {
      // Valid preset reference
      newRef = ref;
    } else {
      return json({ error: "Invalid selectedCardbackRef" }, 400);
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { selectedCardbackRef: newRef },
    });

    return json({ ok: true, selectedCardbackRef: newRef });
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
