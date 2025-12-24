import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSoatcEnabled } from "@/lib/soatc";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  if (!isSoatcEnabled()) {
    return NextResponse.json(
      { error: "SOATC league features are disabled" },
      { status: 404 }
    );
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        soatcUuid: true,
        soatcAutoDetect: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      soatcUuid: user.soatcUuid,
      soatcAutoDetect: user.soatcAutoDetect,
    });
  } catch (error) {
    console.error("Error fetching SOATC settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch SOATC settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!isSoatcEnabled()) {
    return NextResponse.json(
      { error: "SOATC league features are disabled" },
      { status: 404 }
    );
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { soatcUuid, soatcAutoDetect } = body;

    // Validate UUID format if provided
    if (soatcUuid !== null && soatcUuid !== undefined && soatcUuid !== "") {
      if (typeof soatcUuid !== "string" || !UUID_REGEX.test(soatcUuid)) {
        return NextResponse.json(
          { error: "Invalid UUID format" },
          { status: 400 }
        );
      }
    }

    // Build update data
    const updateData: { soatcUuid?: string | null; soatcAutoDetect?: boolean } =
      {};

    if (soatcUuid !== undefined) {
      updateData.soatcUuid = soatcUuid === "" ? null : soatcUuid;
      // If clearing UUID, also disable auto-detect
      if (!soatcUuid) {
        updateData.soatcAutoDetect = false;
      }
    }

    if (soatcAutoDetect !== undefined) {
      updateData.soatcAutoDetect = Boolean(soatcAutoDetect);
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: {
        soatcUuid: true,
        soatcAutoDetect: true,
      },
    });

    return NextResponse.json({
      soatcUuid: user.soatcUuid,
      soatcAutoDetect: user.soatcAutoDetect,
    });
  } catch (error) {
    console.error("Error updating SOATC settings:", error);
    return NextResponse.json(
      { error: "Failed to update SOATC settings" },
      { status: 500 }
    );
  }
}
