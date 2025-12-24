import { NextRequest, NextResponse } from "next/server";
import { getTournamentDetails, isSoatcEnabled } from "@/lib/soatc";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  if (!isSoatcEnabled()) {
    return NextResponse.json(
      { error: "SOATC league features are disabled" },
      { status: 404 }
    );
  }

  const { tournamentId } = await params;

  if (!tournamentId) {
    return NextResponse.json(
      { error: "Tournament ID is required" },
      { status: 400 }
    );
  }

  try {
    const tournament = await getTournamentDetails(tournamentId);

    if (!tournament) {
      return NextResponse.json(
        { error: "Tournament not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      participants: tournament.participants || [],
    });
  } catch (error) {
    console.error("Error fetching SOATC tournament participants:", error);
    return NextResponse.json(
      { error: "Failed to fetch tournament participants" },
      { status: 500 }
    );
  }
}
