import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import {
  normalizeCubeSummary,
  type CubeSummaryInput,
} from "@/lib/cubes/normalizers";
import {
  parseSorceryDeckText,
  toCubeEntries,
} from "@/lib/decks/parsers/sorcery-decktext";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type JSONArray = JSONValue[];
type JSONObject = { [key: string]: JSONValue };
type JSONValue = string | number | boolean | null | JSONObject | JSONArray;

export async function POST(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
    if (!user) {
      return new Response(
        JSON.stringify({
          error:
            "Your account could not be found in the database. If you already have a user account, please sign out, clear your browser cookies and sign back in",
        }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }

    if (process.env.NEXT_PUBLIC_ENABLE_TEXT_IMPORT !== "true") {
      return new Response(
        JSON.stringify({ error: "Text import is disabled" }),
        {
          status: 403,
          headers: { "content-type": "application/json" },
        }
      );
    }

    const body = await req.json().catch(() => ({} as JSONObject));
    const rawText = String(body?.text || "");
    const overrideName = body?.name ? String(body.name).trim() : "";

    if (!rawText.trim()) {
      return new Response(JSON.stringify({ error: "Provide cube text" }), {
        status: 400,
      });
    }

    const parsed = parseSorceryDeckText(rawText);
    const entries = toCubeEntries(parsed);

    type Aggregated = {
      cardId: number;
      setId: number | null;
      variantId: number | null;
      count: number;
      zone: "main" | "sideboard";
    };

    const uniqueNames = Array.from(new Set(entries.map((e) => e.name)));

    const nameToVariant = await batchFindVariants(uniqueNames, [
      "Alpha",
      "Beta",
      "Arthurian Legends",
    ]);

    const aggregated = new Map<string, Aggregated>();
    const unresolved: { name: string; count: number }[] = [];

    for (const entry of entries) {
      const found = nameToVariant.get(entry.name);
      if (!found) {
        unresolved.push({ name: entry.name, count: entry.count });
        continue;
      }
      const zone = entry.cubeZone === "sideboard" ? "sideboard" : "main";
      const key = `${found.cardId}:${found.variantId ?? "none"}:${zone}`;
      const prev = aggregated.get(key);
      if (prev) {
        prev.count += entry.count;
      } else {
        aggregated.set(key, {
          cardId: found.cardId,
          setId: found.setId,
          variantId: found.variantId,
          count: entry.count,
          zone,
        });
      }
    }

    if (unresolved.length) {
      return new Response(
        JSON.stringify({
          error: "Could not map some cards by name",
          unresolved,
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const cubeName =
      overrideName || `Cube Import ${new Date().toLocaleDateString()}`;

    const cube = await prisma.cube.create({
      data: {
        name: cubeName,
        imported: true,
        user: { connect: { id: session.user.id } },
      },
    });

    const cardRows = Array.from(aggregated.values())
      .map((value) => ({
        cubeId: cube.id,
        cardId: value.cardId,
        setId: value.setId,
        variantId: value.variantId,
        count: value.count,
        zone: value.zone,
      }))
      .filter((row) => row.count > 0);

    if (cardRows.length) {
      await prisma.cubeCard.createMany({ data: cardRows });
    }

    const totalCards = cardRows.reduce((sum, row) => sum + row.count, 0);

    const payload: CubeSummaryInput = { ...cube, cardCount: totalCards };
    const summary = normalizeCubeSummary(payload, { isOwner: true });

    return new Response(JSON.stringify(summary), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

function canonicalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\-–—_,:;.!?()/]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .trim();
}

async function batchFindVariants(names: string[], setPreference: string[]) {
  const result = new Map<
    string,
    {
      cardId: number;
      variantId: number | null;
      setId: number | null;
    }
  >();

  if (!names.length) return result;

  const candidates = await prisma.card.findMany({
    where: {
      name: {
        in: names.flatMap((name) => {
          const canon = canonicalize(name);
          return [name, canon];
        }),
      },
    },
    select: {
      id: true,
      name: true,
      variants: {
        select: {
          id: true,
          setId: true,
          set: { select: { name: true } },
        },
      },
    },
  });

  for (const name of names) {
    const canon = canonicalize(name);
    const matches = candidates.filter(
      (c) => canonicalize(c.name) === canon || c.name === name
    );
    if (!matches.length) continue;

    let chosenVariant: {
      id: number | null;
      setId: number | null;
      cardId: number;
    } | null = null;

    for (const preferredSet of setPreference) {
      const withPreferred = matches
        .flatMap((candidate) =>
          candidate.variants.map((variant) => ({
            cardId: candidate.id,
            id: variant.id,
            setId: variant.setId,
            setName: variant.set?.name ?? null,
          }))
        )
        .find((variant) => variant.setName === preferredSet);

      if (withPreferred) {
        chosenVariant = {
          cardId: withPreferred.cardId,
          id: withPreferred.id,
          setId: withPreferred.setId,
        };
        break;
      }
    }

    if (!chosenVariant) {
      const fallback = matches[0];
      const fallbackVariant = fallback.variants[0];
      chosenVariant = fallbackVariant
        ? {
            cardId: fallback.id,
            id: fallbackVariant.id,
            setId: fallbackVariant.setId,
          }
        : { cardId: fallback.id, id: null, setId: null };
    }

    result.set(name, {
      cardId: chosenVariant.cardId,
      variantId: chosenVariant.id,
      setId: chosenVariant.setId,
    });
  }

  return result;
}
