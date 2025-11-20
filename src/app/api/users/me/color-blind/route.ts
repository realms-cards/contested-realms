import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  try {
    const me = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!me) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    const enabled =
      (me as unknown as { colorBlindMode?: boolean }).colorBlindMode ?? false;
    return new Response(JSON.stringify({ enabled: !!enabled }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: unknown) {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
        ? e
        : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const enabledRaw =
      body && typeof body.enabled !== "undefined" ? body.enabled : undefined;
    if (typeof enabledRaw !== "boolean") {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid "enabled" boolean' }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        }
      );
    }
    const me = await prisma.user.update({
      where: { id: session.user.id },
      data: { colorBlindMode: enabledRaw },
    });
    const enabled =
      (me as unknown as { colorBlindMode?: boolean }).colorBlindMode ??
      enabledRaw;
    return new Response(JSON.stringify({ ok: true, enabled: !!enabled }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: unknown) {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
        ? e
        : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
