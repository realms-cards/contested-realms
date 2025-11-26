import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAdminSession();

    const body = (await request.json().catch(() => ({}))) as {
      format?: string;
    };
    const format = body.format;

    // Delete stats, optionally filtered by format
    if (format && ["constructed", "sealed", "draft"].includes(format)) {
      await prisma.humanCardStats.deleteMany({
        where: { format: format as "constructed" | "sealed" | "draft" },
      });
    } else {
      // Clear all formats
      await prisma.humanCardStats.deleteMany({});
    }

    return NextResponse.json({
      success: true,
      clearedFormat: format || "all",
      clearedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to clear meta stats:", error);
    return NextResponse.json(
      { error: "Failed to clear meta statistics" },
      { status: 500 }
    );
  }
}
