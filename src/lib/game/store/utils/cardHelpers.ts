import type { CardRef, PlayerKey, Thresholds } from "../types";
import { newZoneCardInstanceId } from "./idHelpers";

export function ensureCardInstanceId(card: CardRef): CardRef {
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
  if (!Number.isFinite(cardId)) return null;

  let variantId: number | null = null;
  if (src.variantId !== undefined && src.variantId !== null) {
    const candidateVariant =
      typeof src.variantId === "number"
        ? src.variantId
        : Number(src.variantId);
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
    typeof src.type === "string"
      ? src.type
      : src.type === null
      ? null
      : null;

  const slug =
    typeof src.slug === "string"
      ? src.slug
      : src.slug === null
      ? null
      : null;

  const owner =
    src.owner === "p1" || src.owner === "p2"
      ? (src.owner as PlayerKey)
      : null;

  return {
    cardId,
    variantId,
    name,
    type,
    slug,
    thresholds,
    owner,
    instanceId,
  };
}

export function normalizeCardRefList(
  candidate: unknown,
  fallback: CardRef[]
): CardRef[] {
  const source = Array.isArray(candidate) ? candidate : fallback;
  const normalized: CardRef[] = [];
  for (const entry of source) {
    const ensured = normalizeCardRefEntry(entry);
    if (ensured) normalized.push(ensured);
  }
  return normalized;
}
