import { NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import { getAdminStats, runConnectionTests } from "@/lib/admin/diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdminSession();
    const [connections, stats] = await Promise.all([
      runConnectionTests(),
      getAdminStats(),
    ]);
    return NextResponse.json({
      connections,
      stats,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    console.error("[admin] status endpoint failed:", error);
    return NextResponse.json(
      { error: "Failed to load admin status" },
      { status: 500 }
    );
  }
}
