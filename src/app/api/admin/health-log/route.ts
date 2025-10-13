import { NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import { getHealthHistory } from "@/lib/admin/diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAdminSession();
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.floor(limitRaw)) : undefined;
    const history = getHealthHistory(limit);
    return NextResponse.json({
      history,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    console.error("[admin] health-log endpoint failed:", error);
    return NextResponse.json(
      { error: "Failed to load health history" },
      { status: 500 }
    );
  }
}
