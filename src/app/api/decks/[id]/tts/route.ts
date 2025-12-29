import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Card image base URL - use CDN or local assets
const CDN_BASE = process.env.NEXT_PUBLIC_TEXTURE_ORIGIN || "";
const CARD_BACK_URL = `${CDN_BASE}/api/assets/cardback_spellbook.png`;

// GET /api/decks/[id]/tts
// Returns TTS-compatible JSON format (same structure as curiosa.io/api/decks/[id]/tts)
// This endpoint is public for TTS import compatibility
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Missing id" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const deck = await prisma.deck.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        format: true,
        isPublic: true,
        cards: {
          include: {
            card: true,
            variant: true,
            set: true,
          },
        },
      },
    });

    // Only allow access to public decks (TTS import doesn't have auth)
    if (!deck || !deck.isPublic) {
      return new Response(
        JSON.stringify({ error: "Deck not found or private" }),
        {
          status: 404,
          headers: { "content-type": "application/json" },
        }
      );
    }

    // Get metadata for card types
    const pairs = deck.cards
      .filter((dc) => dc.setId != null)
      .map((dc) => ({ cardId: dc.cardId, setId: dc.setId as number }));

    const metaMap = new Map<string, { type: string | null }>();
    if (pairs.length) {
      const metas = await prisma.cardSetMetadata.findMany({
        where: { OR: pairs },
        select: { cardId: true, setId: true, type: true },
      });
      for (const m of metas) {
        metaMap.set(`${m.cardId}:${m.setId}`, { type: m.type });
      }
    }

    // Build card objects for TTS
    type TTSCard = {
      GUID: string;
      Name: string;
      Transform: {
        posX: number;
        posY: number;
        posZ: number;
        rotX: number;
        rotY: number;
        rotZ: number;
        scaleX: number;
        scaleY: number;
        scaleZ: number;
      };
      Nickname: string;
      Description: string;
      CardID: number;
      CustomDeck: Record<
        string,
        {
          FaceURL: string;
          BackURL: string;
          NumWidth: number;
          NumHeight: number;
          BackIsHidden: boolean;
          UniqueBack: boolean;
        }
      >;
    };

    const containedObjects: TTSCard[] = [];
    const deckIDs: number[] = [];
    const customDeck: Record<
      string,
      {
        FaceURL: string;
        BackURL: string;
        NumWidth: number;
        NumHeight: number;
        BackIsHidden: boolean;
        UniqueBack: boolean;
      }
    > = {};

    let cardIndex = 100; // TTS uses 100-based card IDs

    for (const dc of deck.cards) {
      const key = dc.setId ? `${dc.cardId}:${dc.setId}` : null;
      const meta = key ? metaMap.get(key) : undefined;
      const type = meta?.type || dc.variant?.typeText || "";
      const slug = dc.variant?.slug || "";

      // Build image URL
      const imageUrl = slug
        ? `${CDN_BASE}/api/images/${slug}`
        : `${CDN_BASE}/api/assets/cardback_spellbook.png`;

      // Add cards based on count
      for (let i = 0; i < dc.count; i++) {
        const cardID = cardIndex * 100; // TTS format: deckId * 100
        const deckKey = String(cardIndex);

        customDeck[deckKey] = {
          FaceURL: imageUrl,
          BackURL: CARD_BACK_URL,
          NumWidth: 1,
          NumHeight: 1,
          BackIsHidden: true,
          UniqueBack: false,
        };

        const cardObj: TTSCard = {
          GUID: generateGUID(),
          Name: "Card",
          Transform: {
            posX: 0,
            posY: 0,
            posZ: 0,
            rotX: 0,
            rotY: 180,
            rotZ: 180,
            scaleX: 1,
            scaleY: 1,
            scaleZ: 1,
          },
          Nickname: dc.card.name,
          Description: type,
          CardID: cardID,
          CustomDeck: { [deckKey]: customDeck[deckKey] },
        };

        containedObjects.push(cardObj);
        deckIDs.push(cardID);
        cardIndex++;
      }
    }

    // Build TTS deck object
    const ttsObject = {
      SaveName: deck.name,
      GameMode: "",
      Gravity: 0.5,
      PlayArea: 0.5,
      Date: "",
      Table: "",
      Sky: "",
      Note: `Exported from realms.cards - ${deck.name}`,
      Rules: "",
      XmlUI: "",
      LuaScript: "",
      LuaScriptState: "",
      ObjectStates: [
        {
          GUID: generateGUID(),
          Name: "DeckCustom",
          Transform: {
            posX: 0,
            posY: 1,
            posZ: 0,
            rotX: 0,
            rotY: 180,
            rotZ: 180,
            scaleX: 1,
            scaleY: 1,
            scaleZ: 1,
          },
          Nickname: deck.name,
          Description: `${deck.format} deck from realms.cards`,
          ColorDiffuse: {
            r: 0.713235259,
            g: 0.713235259,
            b: 0.713235259,
          },
          LayoutGroupSortIndex: 0,
          Value: 0,
          Locked: false,
          Grid: true,
          Snap: true,
          IgnoreFoW: false,
          MeasureMovement: false,
          DragSelectable: true,
          Autoraise: true,
          Sticky: true,
          Tooltip: true,
          GridProjection: false,
          HideWhenFaceDown: true,
          Hands: false,
          SidewaysCard: false,
          DeckIDs: deckIDs,
          CustomDeck: customDeck,
          ContainedObjects: containedObjects,
        },
      ],
    };

    return new Response(JSON.stringify(ttsObject, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  } catch (e: unknown) {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
        ? e
        : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

// Generate a random GUID for TTS objects
function generateGUID(): string {
  const chars = "abcdef0123456789";
  let guid = "";
  for (let i = 0; i < 6; i++) {
    guid += chars[Math.floor(Math.random() * chars.length)];
  }
  return guid;
}
