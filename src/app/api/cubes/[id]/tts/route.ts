import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Use Curiosa's CloudFront CDN for TTS
const CURIOSA_CDN = "https://d27a44hjr9gen3.cloudfront.net";
const SPELLBOOK_BACK_URL = `${CURIOSA_CDN}/assets/tts/cardbacks/cardback-spellbook.png`;

function buildCardImageUrl(slug: string): string {
  if (!slug) return SPELLBOOK_BACK_URL;
  return `${CURIOSA_CDN}/cards/${slug}.png`;
}

// GET /api/cubes/[id]/tts
// Returns TTS-compatible JSON format for cube cards as a single pile
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

    const cube = await prisma.cube.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
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

    if (!cube) {
      return new Response(JSON.stringify({ error: "Cube not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    // Get metadata for card types
    const pairs = cube.cards
      .filter((cc) => cc.setId != null)
      .map((cc) => ({ cardId: cc.cardId, setId: cc.setId as number }));

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

    // TTS card type
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

    type CustomDeckEntry = {
      FaceURL: string;
      BackURL: string;
      NumWidth: number;
      NumHeight: number;
      BackIsHidden: boolean;
      UniqueBack: boolean;
    };

    type ZoneData = {
      cards: TTSCard[];
      deckIDs: number[];
      customDeck: Record<string, CustomDeckEntry>;
    };

    // Two zones: Main (draft boosters) and Extras (sideboard)
    const zones: Record<string, ZoneData> = {
      Main: { cards: [], deckIDs: [], customDeck: {} },
      Extras: { cards: [], deckIDs: [], customDeck: {} },
    };

    let cardIndex = 100;

    for (const cc of cube.cards) {
      const key = cc.setId ? `${cc.cardId}:${cc.setId}` : null;
      const meta = key ? metaMap.get(key) : undefined;
      const type = meta?.type || cc.variant?.typeText || "";
      const slug = cc.variant?.slug || "";

      // Determine zone
      const cardZone = (cc as { zone?: string }).zone || "main";
      const targetZone = cardZone === "sideboard" ? zones.Extras : zones.Main;

      const faceUrl = buildCardImageUrl(slug);
      const backUrl = SPELLBOOK_BACK_URL;

      // Add cards based on count
      for (let i = 0; i < cc.count; i++) {
        const cardID = cardIndex * 100;
        const deckKey = String(cardIndex);

        const deckEntry: CustomDeckEntry = {
          FaceURL: faceUrl,
          BackURL: backUrl,
          NumWidth: 1,
          NumHeight: 1,
          BackIsHidden: true,
          UniqueBack: false,
        };

        targetZone.customDeck[deckKey] = deckEntry;

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
          Nickname: cc.card.name,
          Description: type,
          CardID: cardID,
          CustomDeck: { [deckKey]: deckEntry },
        };

        targetZone.cards.push(cardObj);
        targetZone.deckIDs.push(cardID);
        cardIndex++;
      }
    }

    // Build TTS object states
    // Main pile at center, Extras pile offset to the right
    type ZoneConfig = {
      posX: number;
      posZ: number;
      rotZ: number;
    };

    const zoneConfigs: Record<string, ZoneConfig> = {
      Main: { posX: 0, posZ: 0, rotZ: 180 }, // Face down, center
      Extras: { posX: 5, posZ: 0, rotZ: 180 }, // Face down, right of main
    };

    const objectStates: Record<string, unknown>[] = [];

    for (const [zoneName, zoneData] of Object.entries(zones)) {
      if (zoneData.cards.length === 0) continue;

      const config = zoneConfigs[zoneName] || { posX: 0, posZ: 0, rotZ: 180 };

      if (zoneData.cards.length === 1) {
        const card = zoneData.cards[0];
        objectStates.push({
          GUID: generateGUID(),
          Name: "Card",
          Transform: {
            posX: config.posX,
            posY: 1,
            posZ: config.posZ,
            rotX: 0,
            rotY: 180,
            rotZ: config.rotZ,
            scaleX: 1,
            scaleY: 1,
            scaleZ: 1,
          },
          Nickname: card.Nickname,
          Description: card.Description,
          CardID: card.CardID,
          CustomDeck: card.CustomDeck,
          ColorDiffuse: { r: 0.713235259, g: 0.713235259, b: 0.713235259 },
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
          Hands: true,
          SidewaysCard: false,
        });
      } else {
        objectStates.push({
          GUID: generateGUID(),
          Name: "Deck",
          Transform: {
            posX: config.posX,
            posY: 1,
            posZ: config.posZ,
            rotX: 0,
            rotY: 180,
            rotZ: config.rotZ,
            scaleX: 1,
            scaleY: 1,
            scaleZ: 1,
          },
          Nickname: zoneName === "Main" ? cube.name : `${cube.name} (Extras)`,
          Description: "",
          ColorDiffuse: { r: 0.713235259, g: 0.713235259, b: 0.713235259 },
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
          DeckIDs: zoneData.deckIDs,
          CustomDeck: zoneData.customDeck,
          ContainedObjects: zoneData.cards,
        });
      }
    }

    const mainCount = zones.Main.cards.length;
    const extrasCount = zones.Extras.cards.length;
    const noteText = extrasCount > 0
      ? `Exported from realms.cards - ${cube.name}\nMain: ${mainCount} cards, Extras: ${extrasCount} cards`
      : `Exported from realms.cards - ${cube.name}\nCards: ${mainCount}`;

    const ttsObject = {
      SaveName: cube.name,
      GameMode: "",
      Gravity: 0.5,
      PlayArea: 0.5,
      Date: "",
      Table: "",
      Sky: "",
      Note: noteText,
      Rules: "",
      XmlUI: "",
      LuaScript: "",
      LuaScriptState: "",
      ObjectStates: objectStates,
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
