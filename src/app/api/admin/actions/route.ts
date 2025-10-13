import { NextResponse } from "next/server";
import {
  ADMIN_ACTIONS,
  executeAdminAction,
  type AdminActionId,
} from "@/lib/admin/actions";
import {
  AdminAccessError,
  requireAdminSession,
} from "@/lib/admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdminSession();
    return NextResponse.json({ actions: ADMIN_ACTIONS });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    console.error("[admin] failed to enumerate actions:", error);
    return NextResponse.json(
      { error: "Failed to enumerate admin actions" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAdminSession();
    const body = await request.json().catch(() => null);
    const actionId = body?.action as AdminActionId | undefined;
    if (!actionId) {
      return NextResponse.json(
        { error: "Missing action identifier" },
        { status: 400 }
      );
    }
    const isRecognized = ADMIN_ACTIONS.some(
      (action) => action.id === actionId
    );
    if (!isRecognized) {
      return NextResponse.json(
        { error: `Unknown admin action: ${actionId}` },
        { status: 400 }
      );
    }

    const result = await executeAdminAction(actionId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    console.error("[admin] action execution failed:", error);
    return NextResponse.json(
      { error: "Admin action failed" },
      { status: 500 }
    );
  }
}
