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
    select: { id: true, patronTier: true, selectedPlaymatRef: true },
  });

  if (!me?.id) return null;
  if (!me.patronTier) return null;
  return me.id;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const userId = await requirePatronUserId();
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const { id } = await ctx.params;
    if (!id) return json({ error: "Missing id" }, 400);

    const playmat = await prisma.customPlaymat.findFirst({
      where: { id, userId },
      select: {
        id: true,
        name: true,
        width: true,
        height: true,
        sizeBytes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!playmat) return json({ error: "Not found" }, 404);
    return json({ playmat });
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

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) return json({ error: "Unauthorized" }, 401);

    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, patronTier: true, selectedPlaymatRef: true },
    });

    if (!me?.id || !me.patronTier) return json({ error: "Unauthorized" }, 401);

    const { id } = await ctx.params;
    if (!id) return json({ error: "Missing id" }, 400);

    const owned = await prisma.customPlaymat.findFirst({
      where: { id, userId: me.id },
      select: { id: true },
    });

    if (!owned) return json({ error: "Not found" }, 404);

    await prisma.customPlaymat.delete({
      where: { id },
    });

    const selected = me.selectedPlaymatRef ?? null;
    const expectedRef = `custom:${id}`;
    if (selected === expectedRef) {
      await prisma.user.update({
        where: { id: me.id },
        data: { selectedPlaymatRef: null },
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
