import type { CardRef, PlayerKey, Thresholds } from "../types";
import { newZoneCardInstanceId } from "./idHelpers";

export function ensureCardInstanceId(
  card: CardRef | null | undefined
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
  };
}

export function normalizeCardRefList(
  candidate: unknown,
  fallback: CardRef[]
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
        } cards failed validation (${Math.round(failRate * 100)}%)`
      );
    }
  }
  return normalized;
}
