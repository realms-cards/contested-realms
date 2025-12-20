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
  { params }: { params: Promise<{ userId: string }> }
): Promise<Response> {
  try {
    const { userId } = await params;
    if (!userId) return json({ error: "Missing userId" }, 400);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { selectedSpellbookRef: true, selectedAtlasRef: true },
    });

    if (!user) return json({ error: "User not found" }, 404);

    return json({
      selectedSpellbookRef: user.selectedSpellbookRef ?? null,
      selectedAtlasRef: user.selectedAtlasRef ?? null,
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
