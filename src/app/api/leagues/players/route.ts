/**
 * GET /api/leagues/players?userIds=id1,id2
 * Returns league memberships for given user IDs (for badge display).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { getLeaguesForUsers } from "@/lib/leagues/membership";

export async function GET(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const userIdsParam = searchParams.get("userIds");

  if (!userIdsParam) {
    return NextResponse.json(
      { error: "userIds parameter required" },
      { status: 400 },
    );
  }

  const userIds = userIdsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (userIds.length === 0 || userIds.length > 20) {
    return NextResponse.json(
      { error: "Provide 1-20 user IDs" },
      { status: 400 },
    );
  }

  const result = await getLeaguesForUsers(userIds);

  return NextResponse.json({ players: result });
}
