import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const patrons = await prisma.user.findMany({
      where: {
        patronTier: { not: null },
      },
      select: {
        id: true,
        name: true,
        patronTier: true,
      },
    });

    const apprentice = patrons
      .filter((p) => p.patronTier === "apprentice")
      .map((p) => ({ id: p.id, name: p.name ?? p.id }));
    const grandmaster = patrons
      .filter((p) => p.patronTier === "grandmaster")
      .map((p) => ({ id: p.id, name: p.name ?? p.id }));
    const kingofthe = patrons
      .filter((p) => p.patronTier === "kingofthe")
      .map((p) => ({ id: p.id, name: p.name ?? p.id }));

    return NextResponse.json({
      apprentice,
      grandmaster,
      kingofthe,
      all: [...kingofthe, ...grandmaster, ...apprentice],
    });
  } catch (error) {
    console.error("[patrons] Failed to fetch patrons:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch patrons",
        apprentice: [],
        grandmaster: [],
        all: [],
      },
      { status: 500 }
    );
  }
}
