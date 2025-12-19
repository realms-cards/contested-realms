import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function requirePatronUserId(): Promise<string | null> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return null;

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, patronTier: true },
  });

  if (!me?.id) return null;
  if (!me.patronTier) return null;
  return me.id;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const userId = await requirePatronUserId();
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const { id } = await params;
    if (!id) return json({ error: "Missing id" }, 400);

    const found = await prisma.customCardback.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!found) return json({ error: "Not found" }, 404);

    await prisma.customCardback.delete({ where: { id } });

    // If this was the selected cardback, clear the selection
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { selectedCardbackRef: true },
    });

    if (me?.selectedCardbackRef === `custom:${id}`) {
      await prisma.user.update({
        where: { id: userId },
        data: { selectedCardbackRef: null },
      });
    }

    return json({ ok: true });
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
