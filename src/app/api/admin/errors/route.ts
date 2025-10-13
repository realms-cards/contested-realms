import { NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import type { AdminErrorRecord } from "@/lib/admin/types";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdminSession();
    const events = await prisma.socketBroadcastHealth.findMany({
      orderBy: { timestamp: "desc" },
      take: 50,
    });
    const records: AdminErrorRecord[] = events.map((event) => ({
      id: event.id,
      timestamp: event.timestamp.toISOString(),
      eventType: event.eventType,
      success: event.success,
      statusCode: event.statusCode ?? null,
      errorMessage: event.errorMessage ?? null,
      targetUrl: event.targetUrl,
      retryCount: event.retryCount,
    }));
    return NextResponse.json({
      events: records,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    console.error("[admin] errors endpoint failed:", error);
    return NextResponse.json(
      { error: "Failed to load error events" },
      { status: 500 }
    );
  }
}
