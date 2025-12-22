import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string; id: string }> }
): Promise<Response> {
  try {
    const { userId, id } = await params;
    if (!userId || !id) return new Response("Missing params", { status: 400 });

    const found = await prisma.customPlaymat.findFirst({
      where: { id, userId },
      select: {
        data: true,
        mimeType: true,
        updatedAt: true,
      },
    });

    if (!found) return new Response("Not found", { status: 404 });

    const etag = `"${id}-playmat-${found.updatedAt.getTime()}"`;
    const ifNoneMatch = req.headers.get("if-none-match");

    if (ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          etag,
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        },
      });
    }

    return new Response(Buffer.from(found.data), {
      status: 200,
      headers: {
        "Content-Type": found.mimeType,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        etag,
      },
    });
  } catch {
    return new Response("Internal error", { status: 500 });
  }
}
