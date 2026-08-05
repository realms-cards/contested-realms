/**
 * Four Cores Deck Service
 *
 * Fetches deck data from fourcores.xyz and normalizes it into the same shape
 * the Curiosa importer already consumes (`CuriosatrpcResult`), so both sources
 * share a single import pipeline.
 *
 * Four Cores exposes decks at `/api/decks/<id>/list`, the same interop shape
 * realms.cards serves from its own `/api/decks/[id]/list` route (see
 * `@/lib/decks/curiosa-compat`). The normalizer below is deliberately tolerant
 * about field naming so small differences between the two implementations
 * (`quantity` vs `count`, flattened card fields, a separate sites array) do not
 * break the import.
 */

import {
  fetchWithTimeout,
  type CuriosatrpcDeck,
  type CuriosatrpcResult,
} from "@/lib/services/curiosa-deck";

const FOURCORES_HOSTS = new Set(["fourcores.xyz", "www.fourcores.xyz"]);

const FOURCORES_ORIGIN = "https://fourcores.xyz";

/** True when the pasted URL points at a Four Cores deck */
export function isFourCoresUrl(urlOrId: string): boolean {
  try {
    const u = new URL(urlOrId);
    return FOURCORES_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Extract the Four Cores deck ID from a deck page URL or an API URL.
 * Handles `/decks/<id>`, `/api/decks/<id>` and `/api/decks/<id>/list`.
 */
export function extractFourCoresDeckId(urlOrId: string): string | null {
  try {
    const u = new URL(urlOrId);
    const parts = u.pathname.split("/").filter(Boolean);
    const decksIndex = parts.indexOf("decks");
    if (decksIndex !== -1 && parts[decksIndex + 1]) {
      return parts[decksIndex + 1] || null;
    }
    const last = parts[parts.length - 1] || "";
    return last || null;
  } catch {
    const trimmed = urlOrId.trim().replace(/^[#/]+|[?#].*$/g, "");
    return trimmed || null;
  }
}

// --- narrowing helpers (no `any`) -----------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

/** First non-null string from a list of candidate keys on a record */
function pickText(
  record: Record<string, unknown> | null,
  keys: string[]
): string | null {
  if (!record) return null;
  for (const key of keys) {
    const found = asText(record[key]);
    if (found) return found;
  }
  return null;
}

/** First positive number from a list of candidate keys on a record */
function pickCount(
  record: Record<string, unknown> | null,
  keys: string[]
): number | null {
  if (!record) return null;
  for (const key of keys) {
    const found = asCount(record[key]);
    if (found) return found;
  }
  return null;
}

// --- normalization ---------------------------------------------------------

type CuriosaVariant = CuriosatrpcDeck["card"]["variants"][number];

/**
 * Four Cores sends `variants: []` for cards it has no printing data for yet
 * (e.g. very recent releases). We leave the list empty rather than inventing a
 * variant from the card slug: the importer already falls back to `card.slug`
 * and then to a name lookup, and a fake variant slug could match the wrong
 * printing.
 */
function normalizeVariants(raw: unknown): CuriosatrpcDeck["card"]["variants"] {
  return asArray(raw)
    .map((entry): CuriosaVariant | null => {
      const record = asRecord(entry);
      if (!record) return null;
      const slug = pickText(record, ["slug", "variantSlug", "id"]);
      if (!slug) return null;
      const setName = pickText(
        asRecord(asRecord(record["setCard"])?.["set"]) ?? asRecord(record["set"]),
        ["name"]
      );
      return {
        id: pickText(record, ["id", "variantId"]) ?? slug,
        slug,
        ...(setName ? { setCard: { set: { name: setName } } } : {}),
      };
    })
    .filter((v): v is CuriosaVariant => v !== null);
}

/**
 * Normalize a single deck entry. `forcedType` is used for entries that arrive
 * in a dedicated list (e.g. a separate `sites` array) without type metadata.
 */
function normalizeEntry(
  raw: unknown,
  forcedType?: string
): CuriosatrpcDeck | null {
  const record = asRecord(raw);
  if (!record) return null;

  // Card fields may be nested under `card` or flattened onto the entry itself
  const card = asRecord(record["card"]) ?? record;

  const name = pickText(card, ["name", "cardName", "title"]);
  if (!name) return null;

  const quantity =
    pickCount(record, ["quantity", "count", "qty", "amount", "copies"]) ??
    pickCount(card, ["quantity", "count", "qty", "amount", "copies"]) ??
    1;

  const slug = pickText(card, ["slug", "cardSlug", "variantSlug"]) ?? "";
  const type = forcedType ?? pickText(card, ["type", "cardType"]) ?? "";
  const category = pickText(card, ["category", "cardCategory"]) ?? "";
  const variants = normalizeVariants(card["variants"]);
  const variantId =
    pickText(record, ["variantId"]) ??
    pickText(card, ["variantId"]) ??
    variants[0]?.id ??
    "";

  return {
    quantity,
    variantId,
    card: {
      id: pickText(card, ["id", "cardId"]) || slug || name,
      slug,
      name,
      type,
      category,
      variants,
    },
  };
}

function isAvatarEntry(entry: CuriosatrpcDeck): boolean {
  return (
    entry.card.type.toLowerCase().includes("avatar") ||
    entry.card.category.toLowerCase().includes("avatar")
  );
}

function normalizeList(raw: unknown, forcedType?: string): CuriosatrpcDeck[] {
  return asArray(raw)
    .map((entry) => normalizeEntry(entry, forcedType))
    .filter((entry): entry is CuriosatrpcDeck => entry !== null);
}

/** Resolve the avatar name from whichever field Four Cores used */
function readAvatarName(root: Record<string, unknown>): string | null {
  const direct = pickText(root, ["avatarName"]);
  if (direct) return direct;

  // `avatar` may be a string, a card object, or an entry wrapping a card
  const avatarValue = root["avatar"];
  const fromString = asText(avatarValue);
  if (fromString) return fromString;

  const avatarRecord = asRecord(avatarValue);
  if (avatarRecord) {
    return (
      pickText(avatarRecord, ["name"]) ??
      pickText(asRecord(avatarRecord["card"]), ["name"])
    );
  }

  // `avatars` array, as used by Curiosa's deck metadata
  for (const entry of asArray(root["avatars"])) {
    const record = asRecord(entry);
    if (!record) continue;
    const name =
      pickText(record, ["name"]) ?? pickText(asRecord(record["card"]), ["name"]);
    if (name) return name;
  }

  return null;
}

/**
 * Convert a Four Cores `/api/decks/<id>/list` response into the shape the
 * Curiosa importer consumes.
 *
 * The importer adds the avatar to the Spellbook itself from `avatarName`, so
 * any avatar found inside the main deck list is lifted out here to avoid
 * importing it twice.
 */
export function normalizeFourCoresDeck(
  payload: unknown
): CuriosatrpcResult | null {
  // Some endpoints return the entries array directly
  if (Array.isArray(payload)) {
    const entries = normalizeList(payload);
    if (entries.length === 0) return null;
    const avatars = entries.filter(isAvatarEntry);
    return {
      deckList: entries.filter((entry) => !isAvatarEntry(entry)),
      sideboardList: [],
      avatarName: avatars[0]?.card.name ?? null,
      deckName: null,
    };
  }

  const root = asRecord(payload);
  if (!root) return null;

  // Unwrap a `data`/`deck` envelope if present
  const body =
    asRecord(root["deck"]) ??
    (root["deckList"] === undefined ? asRecord(root["data"]) : null) ??
    root;

  const mainRaw =
    body["deckList"] ?? body["cards"] ?? body["mainDeck"] ?? body["list"];
  const sitesRaw = body["sites"] ?? body["atlas"];
  const sideboardRaw =
    body["sideboardList"] ?? body["sideboard"] ?? body["collection"];

  const main = normalizeList(mainRaw);
  // A dedicated sites/atlas array carries no type metadata of its own
  const sites = normalizeList(sitesRaw, "Site");
  const sideboard = normalizeList(sideboardRaw);

  const combined = [...main, ...sites];
  if (combined.length === 0 && sideboard.length === 0) return null;

  const avatarFromList = combined.find(isAvatarEntry) ?? null;
  const avatarName = readAvatarName(body) ?? avatarFromList?.card.name ?? null;

  return {
    deckList: combined.filter((entry) => !isAvatarEntry(entry)),
    sideboardList: sideboard,
    avatarName,
    deckName: pickText(body, ["deckName", "name", "title"]),
  };
}

/**
 * Fetch and normalize a Four Cores deck. Returns null when the deck can't be
 * fetched or contains no recognizable cards.
 */
export async function fetchFourCoresDeck(
  urlOrId: string
): Promise<CuriosatrpcResult | null> {
  const deckId = extractFourCoresDeckId(urlOrId);
  if (!deckId) return null;

  const candidates: string[] = [
    `${FOURCORES_ORIGIN}/api/decks/${encodeURIComponent(deckId)}/list`,
  ];
  // If the user pasted an API URL directly, try it verbatim as well
  if (isFourCoresUrl(urlOrId) && /\/api\//.test(urlOrId)) {
    if (!candidates.includes(urlOrId)) candidates.unshift(urlOrId);
  }

  for (const url of candidates) {
    try {
      const res = await fetchWithTimeout(
        url,
        {
          cache: "no-store",
          headers: { Accept: "application/json, text/plain, */*" },
        },
        10000
      );
      if (!res.ok) continue;

      const text = await res.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        continue;
      }

      const normalized = normalizeFourCoresDeck(payload);
      if (normalized) return normalized;
    } catch {
      // Try the next candidate
    }
  }

  return null;
}
