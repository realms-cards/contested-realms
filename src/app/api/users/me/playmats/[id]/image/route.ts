import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) return json({ error: "Unauthorized" }, 401);

    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, patronTier: true },
    });

    if (!me?.id || !me.patronTier) return json({ error: "Unauthorized" }, 401);

    const { id } = await ctx.params;
    if (!id) return json({ error: "Missing id" }, 400);

    const found = await prisma.customPlaymat.findFirst({
      where: { id, userId: me.id },
      select: { data: true, mimeType: true, updatedAt: true },
    });

    if (!found) return json({ error: "Not found" }, 404);

    // Generate ETag from id + updatedAt for cache validation
    const etag = `"${id}-${found.updatedAt.getTime()}"`;

    // Check If-None-Match header for conditional request
    const ifNoneMatch = _req.headers.get("if-none-match");
    if (ifNoneMatch === etag) {
      return new Response(null, { status: 304 });
    }

    return new Response(new Uint8Array(found.data), {
      status: 200,
      headers: {
        "content-type": found.mimeType || "image/png",
        // Cache for 1 day, revalidate in background after 1 hour
        "cache-control": "private, max-age=3600, stale-while-revalidate=86400",
        etag,
      },
    });
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
