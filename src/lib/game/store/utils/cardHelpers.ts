import type { CardRef, PlayerKey, Thresholds } from "../types";
import { newZoneCardInstanceId } from "./idHelpers";

export function ensureCardInstanceId(
  card: CardRef | null | undefined,
): CardRef | null {
  if (!card) return null;
  if (card.instanceId && card.instanceId.length > 0) {
    return card;
  }
  return {
    ...card,
    instanceId: newZoneCardInstanceId(),
  };
}

export function prepareCardForSeat(card: CardRef, owner: PlayerKey): CardRef {
  const ensured = ensureCardInstanceId(card);
  if (!ensured) {
    // Fallback: create a new card ref with instance ID if input was invalid
    return { ...card, instanceId: newZoneCardInstanceId(), owner };
  }
  if (ensured.owner === owner) return ensured;
  return { ...ensured, owner };
}

export function normalizeCardRefEntry(candidate: unknown): CardRef | null {
  if (!candidate || typeof candidate !== "object") return null;
  const src = candidate as Partial<CardRef> & Record<string, unknown>;
  const rawCardId = src.cardId;
  const cardId =
    typeof rawCardId === "number"
      ? rawCardId
      : typeof rawCardId === "string"
        ? Number(rawCardId)
        : NaN;
  if (!Number.isFinite(cardId)) {
    return null;
  }

  let variantId: number | null = null;
  if (src.variantId !== undefined && src.variantId !== null) {
    const candidateVariant =
      typeof src.variantId === "number" ? src.variantId : Number(src.variantId);
    variantId = Number.isFinite(candidateVariant) ? candidateVariant : null;
  }

  let thresholds: Partial<Thresholds> | null = null;
  if (src.thresholds && typeof src.thresholds === "object") {
    thresholds = { ...(src.thresholds as Partial<Thresholds>) };
  }

  const instanceId =
    typeof src.instanceId === "string" && src.instanceId.length > 0
      ? src.instanceId
      : newZoneCardInstanceId();

  const name =
    typeof src.name === "string"
      ? src.name
      : src.name != null
        ? String(src.name)
        : "";

  const type =
    typeof src.type === "string" ? src.type : src.type === null ? null : null;

  const slug =
    typeof src.slug === "string" ? src.slug : src.slug === null ? null : null;

  const owner =
    src.owner === "p1" || src.owner === "p2" ? (src.owner as PlayerKey) : null;

  // Preserve cost if present
  const cost =
    typeof src.cost === "number"
      ? src.cost
      : src.cost === null
        ? null
        : undefined;

  // Preserve subTypes if present
  const subTypes =
    typeof src.subTypes === "string"
      ? src.subTypes
      : src.subTypes === null
        ? null
        : undefined;

  const text =
    typeof src.text === "string"
      ? src.text
      : src.text === null
        ? null
        : undefined;

  const attack =
    typeof src.attack === "number"
      ? src.attack
      : src.attack === null
        ? null
        : undefined;

  const defence =
    typeof src.defence === "number"
      ? src.defence
      : src.defence === null
        ? null
        : undefined;

  const rarity =
    typeof src.rarity === "string"
      ? src.rarity
      : src.rarity === null
        ? null
        : undefined;

  return {
    cardId,
    variantId,
    name,
    type,
    slug,
    thresholds,
    owner,
    instanceId,
    ...(cost !== undefined && { cost }),
    ...(subTypes !== undefined && { subTypes }),
    ...(text !== undefined && { text }),
    ...(attack !== undefined && { attack }),
    ...(defence !== undefined && { defence }),
    ...(rarity !== undefined && { rarity }),
  };
}

export function normalizeCardRefList(
  candidate: unknown,
  fallback: CardRef[],
): CardRef[] {
  const source = Array.isArray(candidate) ? candidate : fallback;
  const normalized: CardRef[] = [];
  let failedCount = 0;
  for (const entry of source) {
    const ensured = normalizeCardRefEntry(entry);
    if (ensured) {
      normalized.push(ensured);
    } else {
      failedCount++;
      // Log failed card for debugging zone loss issues
      if (process.env.NODE_ENV !== "production") {
        try {
          console.warn("[CARD_VALIDATION_FAIL] Card failed normalization:", {
            entry:
              typeof entry === "object"
                ? JSON.stringify(entry).slice(0, 200)
                : entry,
          });
        } catch {}
      }
    }
  }
  // Warn if significant number of cards failed validation
  if (failedCount > 0 && source.length > 0) {
    const failRate = failedCount / source.length;
    if (failRate > 0.5 || failedCount >= 3) {
      console.error(
        `[CARD_VALIDATION_BULK_FAIL] ${failedCount}/${
          source.length
        } cards failed validation (${Math.round(failRate * 100)}%)`,
      );
    }
  }
  return normalized;
}

/**
 * Subtypes the rulebook treats as "Evil".
 * Shared by Doomsday Cult, Black Mass, Accusation and Mephistopheles so the
 * definition cannot drift between resolvers.
 */
export const EVIL_SUBTYPES = ["demon", "undead", "monster"] as const;

/** True when a subtypes string contains one of the Evil subtypes. */
export function isEvilSubtypes(subTypes: string | null | undefined): boolean {
  const lower = (subTypes || "").toLowerCase();
  return EVIL_SUBTYPES.some((evil) => lower.includes(evil));
}

/** True when a card is Evil (Demon, Undead or Monster). */
export function isEvilCard(card: CardRef | null | undefined): boolean {
  if (!card) return false;
  return isEvilSubtypes(card.subTypes);
}

type TransformedSiteForm = {
  subTypes: string;
  attack: number;
  defence: number;
};

/**
 * Sites that may transform into a minion on the board, keyed by lowercase name.
 * Both names exist only as Site cards, so the name alone identifies them.
 */
const TRANSFORMED_SITE_FORMS = new Map<string, TransformedSiteForm>([
  ["island leviathan", { subTypes: "Monster", attack: 8, defence: 8 }],
  ["horns of behemoth", { subTypes: "Demon", attack: 6, defence: 6 }],
]);

function transformedSiteForm(
  name: string | null | undefined,
): TransformedSiteForm | undefined {
  return TRANSFORMED_SITE_FORMS.get((name || "").trim().toLowerCase());
}

/** True for Island Leviathan / Horns of Behemoth (landscape art, site identity off the board). */
export function isTransformableSiteName(
  name: string | null | undefined,
): boolean {
  return transformedSiteForm(name) !== undefined;
}

/**
 * The minion form of a transformed site: a real Minion (Monster/Demon) with its
 * printed power, so every minion check (attach, copy, target, combat) applies.
 * Cost stays null so no mana is charged for the transform.
 */
export function toTransformedSiteMinionCard(card: CardRef): CardRef {
  const form = transformedSiteForm(card.name);
  if (!form) return card;
  return { ...card, type: "Minion", ...form };
}

/** Restores a transformed site's Site identity when it leaves the realm. */
export function restoreTransformedSiteCard(card: CardRef): CardRef {
  if (!isTransformableSiteName(card.name)) return card;
  if ((card.type || "").toLowerCase().includes("site")) return card;
  return { ...card, type: "Site", subTypes: "" };
}
