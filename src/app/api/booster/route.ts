import { NextRequest } from "next/server";
import { generateBoosters, generateCubeBoosters } from "@/lib/booster";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cubeId = searchParams.get("cube");
    const count = Math.max(
      1,
      Math.min(36, Number(searchParams.get("count") || "1"))
    );

    // Cube draft mode
    if (cubeId) {
      const packs = await generateCubeBoosters(cubeId, count);
      return new Response(JSON.stringify({ cubeId, count, packs }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // Regular set-based draft mode
    const set = searchParams.get("set") || "Alpha";
    const isSealed = searchParams.get("sealed") === "true";

    // Enforce draft exclusion for Dragonlord mini-set at the API level.
    // Draft UIs already omit Dragonlord, but this prevents manual/API misuse.
    // Allow Dragonlord for sealed mode (fixed pack mini-set).
    const sl = set.trim().toLowerCase();
    if (
      !isSealed &&
      (sl === "dragonlord" || sl === "drl" || sl.includes("dragonlord"))
    ) {
      return new Response(
        JSON.stringify({ error: "Dragonlord is not available for draft." }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        }
      );
    }
    const replaceAvatars = searchParams.get("replaceAvatars") === "true";

    const packs = await generateBoosters(set, count, undefined, replaceAvatars);

    return new Response(JSON.stringify({ set, count, packs }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: unknown) {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
        ? e
        : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
