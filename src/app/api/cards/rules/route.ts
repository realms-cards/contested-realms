import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Get the rulesText for a card by name from database
 * @param cardName The card name to look up
 * @returns The rulesText string, or null if not found
 */
async function getCardRulesText(cardName: string): Promise<string | null> {
  try {
    console.log('Searching for card:', cardName);
    
    // First, find the card
    const card = await prisma.card.findFirst({
      where: { name: cardName }
    });
    
    console.log('Found card:', card);
    
    if (!card) {
      return null;
    }
    
    // Then find metadata with rulesText for this card
    const metadata = await prisma.cardSetMetadata.findFirst({
      where: {
        cardId: card.id,
        rulesText: {
          not: null
        }
      },
      select: {
        rulesText: true
      },
      orderBy: {
        setId: 'desc' // Get the most recent set's metadata
      }
    });

    console.log('Found metadata:', metadata);
    
    return metadata?.rulesText || null;
  } catch (error) {
    console.error('Error fetching card rules text:', error);
    return null;
  }
}

/**
 * Detect burrow and submerge abilities for a card
 * @param cardName The card name to check
 * @returns Object with canBurrow and canSubmerge boolean flags
 */
async function detectBurrowSubmergeAbilities(cardName: string): Promise<{
  canBurrow: boolean;
  canSubmerge: boolean;
  rulesText: string | null;
}> {
  const rulesText = await getCardRulesText(cardName);
  
  if (!rulesText) {
    return { canBurrow: false, canSubmerge: false, rulesText: null };
  }

  const lowerRulesText = rulesText.toLowerCase();
  
  return {
    canBurrow: lowerRulesText.includes('burrowing'),
    canSubmerge: lowerRulesText.includes('submerge'),
    rulesText
  };
}

// GET /api/cards/rules?name=CardName
// Returns the rulesText and abilities for a specific card
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cardName = (searchParams.get("name") || "").trim();

    if (!cardName) {
      return new Response(
        JSON.stringify({ error: "Card name is required" }), 
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const abilities = await detectBurrowSubmergeAbilities(cardName);
    
    return new Response(
      JSON.stringify({
        cardName,
        rulesText: abilities.rulesText,
        canBurrow: abilities.canBurrow,
        canSubmerge: abilities.canSubmerge
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}