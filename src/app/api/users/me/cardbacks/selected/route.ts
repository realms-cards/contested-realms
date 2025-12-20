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

// Validate a sleeve reference (null, "standard:default", "custom:<id>", or "preset:<id>")
async function validateSleeveRef(
  ref: unknown,
  userId: string
): Promise<
  { valid: true; value: string | null } | { valid: false; error: string }
> {
  if (ref === null || ref === undefined || ref === "standard:default") {
    return { valid: true, value: null };
  }
  if (typeof ref === "string" && ref.startsWith("custom:")) {
    const customId = ref.slice("custom:".length);
    const found = await prisma.customCardback.findFirst({
      where: { id: customId, userId },
      select: { id: true },
    });
    if (!found) return { valid: false, error: "Custom cardback not found" };
    return { valid: true, value: ref };
  }
  if (typeof ref === "string" && isSleevePreset(ref)) {
    return { valid: true, value: ref };
  }
  return { valid: false, error: "Invalid sleeve reference" };
}

export async function GET(): Promise<Response> {
  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) return json({ error: "Unauthorized" }, 401);

    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { selectedSpellbookRef: true, selectedAtlasRef: true },
    });

    return json({
      selectedSpellbookRef: me?.selectedSpellbookRef ?? null,
      selectedAtlasRef: me?.selectedAtlasRef ?? null,
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

    // Check patron status
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, patronTier: true },
    });

    if (!me?.patronTier) return json({ error: "Patron access required" }, 403);

    const body = await req.json().catch(() => ({}));
    const { selectedSpellbookRef, selectedAtlasRef } = body;

    const updateData: {
      selectedSpellbookRef?: string | null;
      selectedAtlasRef?: string | null;
    } = {};

    // Validate and set spellbook ref if provided
    if (selectedSpellbookRef !== undefined) {
      const result = await validateSleeveRef(
        selectedSpellbookRef,
        session.user.id
      );
      if (!result.valid) return json({ error: result.error }, 400);
      updateData.selectedSpellbookRef = result.value;
    }

    // Validate and set atlas ref if provided
    if (selectedAtlasRef !== undefined) {
      const result = await validateSleeveRef(selectedAtlasRef, session.user.id);
      if (!result.valid) return json({ error: result.error }, 400);
      updateData.selectedAtlasRef = result.value;
    }

    if (Object.keys(updateData).length === 0) {
      return json({ error: "No valid fields to update" }, 400);
    }

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: { selectedSpellbookRef: true, selectedAtlasRef: true },
    });

    return json({
      ok: true,
      selectedSpellbookRef: updated.selectedSpellbookRef,
      selectedAtlasRef: updated.selectedAtlasRef,
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
