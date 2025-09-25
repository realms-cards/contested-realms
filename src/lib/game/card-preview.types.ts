import type { CardRef } from "@/lib/game/store";

export type CardPreviewData = {
  slug: string;
  name: string;
  type: string | null;
};

export type CardMeshUserData = {
  cardId: number;
  slug: string;
  type: string | null;
  name?: string;
};

export type DraggableCardHoverHandlers = {
  onHoverChange?: (isHovered: boolean) => void;
  onHoverStart?: (card: CardPreviewData) => void;
  onHoverEnd?: () => void;
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export function isCardPreviewData(value: unknown): value is CardPreviewData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CardPreviewData>;
  if (!isNonEmptyString(candidate.slug)) return false;
  if (!isNonEmptyString(candidate.name)) return false;
  if (candidate.type !== null && typeof candidate.type !== "string") return false;
  return true;
}

export function isCardMeshUserData(value: unknown): value is CardMeshUserData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CardMeshUserData> & { cardId?: unknown };
  if (typeof candidate.cardId !== "number" || !Number.isFinite(candidate.cardId)) {
    return false;
  }
  if (!isNonEmptyString(candidate.slug)) return false;
  if (candidate.type !== null && typeof candidate.type !== "string") return false;
  if (candidate.name !== undefined && typeof candidate.name !== "string") return false;
  return true;
}

export function createCardMeshUserData(input: {
  cardId?: number | null;
  slug?: string | null;
  name?: string | null;
  type?: string | null;
}): CardMeshUserData | null {
  if (!input) return null;
  const slug = typeof input.slug === "string" ? input.slug.trim() : "";
  if (!slug) return null;

  const cardId =
    typeof input.cardId === "number" && Number.isFinite(input.cardId)
      ? input.cardId
      : 0;
  const name =
    typeof input.name === "string" && input.name.trim().length > 0
      ? input.name
      : undefined;
  const type =
    input.type === null || input.type === undefined
      ? null
      : typeof input.type === "string"
        ? input.type
        : null;

  const userData: CardMeshUserData = {
    cardId,
    slug,
    type,
  };
  if (name) {
    userData.name = name;
  }
  return userData;
}

export function createCardPreviewData(input: {
  slug?: string | null;
  name?: string | null;
  type?: string | null;
}): CardPreviewData | null {
  if (!input) return null;
  const slug = typeof input.slug === "string" ? input.slug.trim() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!slug || !name) return null;
  const type =
    input.type === null || input.type === undefined
      ? null
      : typeof input.type === "string"
        ? input.type
        : null;
  return { slug, name, type };
}

export function cardRefToPreview(card: CardRef | null | undefined): CardPreviewData | null {
  if (!card) return null;
  return createCardPreviewData({ slug: card.slug, name: card.name, type: card.type });
}
