import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { id } = await params;
    if (!id) return new Response("Missing id", { status: 400 });

    const found = await prisma.customCardback.findFirst({
      where: { id, userId: session.user.id },
      select: {
        spellbookData: true,
        spellbookMime: true,
        updatedAt: true,
      },
    });

    if (!found) return new Response("Not found", { status: 404 });

    const etag = `"${id}-spellbook-${found.updatedAt.getTime()}"`;
    const ifNoneMatch = req.headers.get("if-none-match");

    if (ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          etag,
          "Cache-Control":
            "private, max-age=3600, stale-while-revalidate=86400",
        },
      });
    }

    return new Response(Buffer.from(found.spellbookData), {
      status: 200,
      headers: {
        "Content-Type": found.spellbookMime,
        "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
        etag,
      },
    });
  } catch {
    return new Response("Internal error", { status: 500 });
  }
}
