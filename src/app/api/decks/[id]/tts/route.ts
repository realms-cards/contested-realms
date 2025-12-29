import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Use Curiosa's CloudFront CDN for TTS - has correct formats including pre-rotated sites
const CURIOSA_CDN = "https://d27a44hjr9gen3.cloudfront.net";
const SPELLBOOK_BACK_URL = `${CURIOSA_CDN}/assets/tts/cardbacks/cardback-spellbook.png`;
const ATLAS_BACK_URL = `${CURIOSA_CDN}/assets/tts/cardbacks/cardback-atlas.png`;
const AVATAR_BACK_URL = `${CURIOSA_CDN}/assets/tts/cardbacks/cardback-avatar.png`;

// Build card image URL (normal orientation)
// Slug format: got-harbinger-b-s -> https://d27a44hjr9gen3.cloudfront.net/cards/got-harbinger-b-s.png
function buildCardImageUrl(slug: string): string {
  if (!slug) return SPELLBOOK_BACK_URL;
  return `${CURIOSA_CDN}/cards/${slug}.png`;
}

// Build rotated site image URL (for atlas cards)
// Slug format: got-the_void-b-s -> https://d27a44hjr9gen3.cloudfront.net/rotated/got-the_void-b-s.png
function buildRotatedImageUrl(slug: string): string {
  if (!slug) return ATLAS_BACK_URL;
  return `${CURIOSA_CDN}/rotated/${slug}.png`;
}

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

    if (!deck) {
      return new Response(JSON.stringify({ error: "Deck not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
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

    // Group cards by zone and detect avatar from type
    type ZoneData = {
      cards: TTSCard[];
      deckIDs: number[];
      customDeck: Record<string, CustomDeckEntry>;
    };

    const zones: Record<string, ZoneData> = {
      Avatar: { cards: [], deckIDs: [], customDeck: {} },
      Spellbook: { cards: [], deckIDs: [], customDeck: {} },
      Atlas: { cards: [], deckIDs: [], customDeck: {} },
      Collection: { cards: [], deckIDs: [], customDeck: {} },
    };

    let cardIndex = 100; // TTS uses 100-based card IDs

    for (const dc of deck.cards) {
      const key = dc.setId ? `${dc.cardId}:${dc.setId}` : null;
      const meta = key ? metaMap.get(key) : undefined;
      const type = meta?.type || dc.variant?.typeText || "";
      const slug = dc.variant?.slug || "";

      // Determine zone - check if it's an avatar by type
      const isAvatar = type.toLowerCase().includes("avatar");
      const isSite = type.toLowerCase().includes("site");
      const zone = isAvatar
        ? "Avatar"
        : (dc as { zone?: string }).zone || "Spellbook";
      const normalizedZone = zone === "Sideboard" ? "Collection" : zone;
      const targetZone = zones[normalizedZone] || zones.Spellbook;

      // Determine image URL and back URL based on card type
      let faceUrl: string;
      let backUrl: string;
      if (isAvatar) {
        faceUrl = buildCardImageUrl(slug);
        backUrl = AVATAR_BACK_URL;
      } else if (normalizedZone === "Atlas" || isSite) {
        faceUrl = buildRotatedImageUrl(slug); // Use pre-rotated images for sites
        backUrl = ATLAS_BACK_URL;
      } else {
        faceUrl = buildCardImageUrl(slug);
        backUrl = SPELLBOOK_BACK_URL;
      }

      // Add cards based on count
      for (let i = 0; i < dc.count; i++) {
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
          Nickname: dc.card.name,
          Description: type,
          CardID: cardID,
          CustomDeck: { [deckKey]: deckEntry },
        };

        targetZone.cards.push(cardObj);
        targetZone.deckIDs.push(cardID);
        cardIndex++;
      }
    }

    // Build TTS object states for each non-empty zone
    // Positions match curiosa.io TTS export layout
    type ZoneConfig = {
      posX: number;
      posZ: number;
      rotZ: number; // 0 = face up, 180 = face down
      scaleX: number;
      scaleZ: number;
    };

    // Positions from reference: Avatar at center-top, decks on right side
    const zoneConfigs: Record<string, ZoneConfig> = {
      Avatar: { posX: 0, posZ: -7.3, rotZ: 0, scaleX: 1, scaleZ: 1 }, // Face up, center top
      Spellbook: { posX: 13.13, posZ: 3.7, rotZ: 180, scaleX: 1, scaleZ: 1 }, // Face down, right side
      Atlas: { posX: 13.13, posZ: 6.9, rotZ: 180, scaleX: 0.71, scaleZ: 0.71 }, // Face down, scaled, right side above spellbook
      Collection: { posX: -13.13, posZ: 3.7, rotZ: 180, scaleX: 1, scaleZ: 1 }, // Face down, left side (sideboard)
    };

    const objectStates: Record<string, unknown>[] = [];

    for (const [zoneName, zoneData] of Object.entries(zones)) {
      if (zoneData.cards.length === 0) continue;

      const config = zoneConfigs[zoneName] || {
        posX: 0,
        posZ: 0,
        rotZ: 180,
        scaleX: 1,
        scaleZ: 1,
      };

      // Single card = Card object, multiple cards = Deck
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
            scaleX: config.scaleX,
            scaleY: 1,
            scaleZ: config.scaleZ,
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
            scaleX: config.scaleX,
            scaleY: 1,
            scaleZ: config.scaleZ,
          },
          Nickname: "",
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

    // Build final TTS save object
    const ttsObject = {
      SaveName: deck.name,
      GameMode: "",
      Gravity: 0.5,
      PlayArea: 0.5,
      Date: "",
      Table: "",
      Sky: "",
      Note: `Exported from realms.cards - ${deck.name}\nPiles: Avatar, Spellbook, Atlas, Collection`,
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
