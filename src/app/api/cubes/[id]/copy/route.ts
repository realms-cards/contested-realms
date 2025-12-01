import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/cubes/[id]/copy
 * Copy a public cube to the current user's cubes
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const { id } = await params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Missing id" }), {
        status: 400,
      });
    }

    // Verify user exists in DB
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
    if (!user) {
      return new Response(
        JSON.stringify({
          error:
            "Your account could not be found in the database. Please sign out and sign back in.",
        }),
        { status: 401 }
      );
    }

    // Find the source cube - must be public or owned by user
    const sourceCube = await prisma.cube.findUnique({
      where: { id },
      include: {
        cards: true,
      },
    });

    if (!sourceCube) {
      return new Response(JSON.stringify({ error: "Cube not found" }), {
        status: 404,
      });
    }

    // Only allow copying public cubes or your own cubes
    if (!sourceCube.isPublic && sourceCube.userId !== session.user.id) {
      return new Response(
        JSON.stringify({ error: "Cannot copy a private cube you don't own" }),
        { status: 403 }
      );
    }

    // Create the new cube
    const newCube = await prisma.cube.create({
      data: {
        name: `${sourceCube.name} (Copy)`,
        description: sourceCube.description,
        isPublic: false,
        imported: false,
        userId: session.user.id,
        cards: {
          create: sourceCube.cards.map((card) => ({
            cardId: card.cardId,
            setId: card.setId,
            variantId: card.variantId,
            count: card.count,
            zone: card.zone,
          })),
        },
      },
    });

    return new Response(
      JSON.stringify({ id: newCube.id, name: newCube.name }),
      { status: 201, headers: { "content-type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
