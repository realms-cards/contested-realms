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

export async function GET(): Promise<Response> {
  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) return json({ error: "Unauthorized" }, 401);

    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        showOpponentPlaymat: true,
        cameraMode: true,
        showPlaymat: true,
        showGrid: true,
      },
    });

    if (!me) return json({ error: "User not found" }, 404);

    return json({
      showOpponentPlaymat: me.showOpponentPlaymat,
      cameraMode: me.cameraMode,
      showPlaymat: me.showPlaymat,
      showGrid: me.showGrid,
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

export async function PATCH(req: NextRequest): Promise<Response> {
  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));

    const updateData: {
      showOpponentPlaymat?: boolean;
      cameraMode?: string;
      showPlaymat?: boolean;
      showGrid?: boolean;
    } = {};

    if (typeof body?.showOpponentPlaymat === "boolean") {
      updateData.showOpponentPlaymat = body.showOpponentPlaymat;
    }

    if (typeof body?.cameraMode === "string") {
      // Validate cameraMode is one of the allowed values
      if (body.cameraMode === "orbit" || body.cameraMode === "topdown") {
        updateData.cameraMode = body.cameraMode;
      }
    }

    if (typeof body?.showPlaymat === "boolean") {
      updateData.showPlaymat = body.showPlaymat;
    }

    if (typeof body?.showGrid === "boolean") {
      updateData.showGrid = body.showGrid;
    }

    if (Object.keys(updateData).length === 0) {
      return json({ error: "No valid fields to update" }, 400);
    }

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: {
        showOpponentPlaymat: true,
        cameraMode: true,
        showPlaymat: true,
        showGrid: true,
      },
    });

    return json({
      ok: true,
      showOpponentPlaymat: updated.showOpponentPlaymat,
      cameraMode: updated.cameraMode,
      showPlaymat: updated.showPlaymat,
      showGrid: updated.showGrid,
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
