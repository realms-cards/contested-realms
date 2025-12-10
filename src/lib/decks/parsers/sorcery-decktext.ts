/*
 * Parser for Sorcery decklists copied from Curiosa-style text export.
 *
 * Supported formats (examples):
 *
 * Sorcery/Curiosa format:
 *   Avatar (1)
 *   1Druid
 *   Aura (1)
 *   1Atlantean Fate
 *   Artifact (4)
 *   2Mix Aqua
 *   1Ring of Morrigan
 *   ...
 *   Site (30)
 *   3Aqueduct
 *   2Autumn River
 *   ...
 *
 * CardNexus format (with set in parentheses):
 *   1 Valley (PROMOTIONAL)
 *   1 Rift Valley (BETA)
 *   1 Valley of Delight (ARTHURIAN-LEGENDS)
 *   1 Necromancer (GOTHIC)
 *
 * Notes:
 * - Copy/paste sometimes introduces standalone numeric lines (cost/threshold icons). We ignore lines that are only digits.
 * - Some lines have no space between quantity and name (e.g., "1Druid"). We accept optional whitespace.
 * - We stop parsing if we encounter a footer like "Deck History".
 * - Cards starting with numbers (e.g., "13 Treasures of Britain") require a separator (space/comma) between count and name.
 */

export type DeckTextCategory =
  | "Avatar"
  | "Aura"
  | "Artifact"
  | "Minion"
  | "Magic"
  | "Site"
  | "Sideboard";

export interface NameCount {
  name: string;
  count: number;
  set?: string; // Optional set name from CardNexus format
}

export interface ParsedDeckText {
  categories: Record<DeckTextCategory, NameCount[]>;
  totalByCategory: Record<DeckTextCategory, number>;
  totalCards: number;
  issues: { type: "error" | "warning"; message: string }[];
}

const CATEGORY_ORDER: DeckTextCategory[] = [
  "Avatar",
  "Aura",
  "Artifact",
  "Minion",
  "Magic",
  "Site",
  "Sideboard",
];

function normalizeName(raw: string): string {
  return raw
    .replace(/[\u00A0\t\r]+/g, " ") // NBSP/tab/CR -> space
    .replace(/[\u2018\u2019]/g, "'") // fancy apostrophe -> '
    .replace(/[\u201C\u201D]/g, '"') // fancy quotes -> "
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeCategory(raw: string): DeckTextCategory | null {
  const base = normalizeName(raw)
    .toLowerCase()
    .replace(/\s+\(.*\)$/, "");
  const word = base.split(/\s+/)[0] ?? base;
  const singular = word.endsWith("s") ? word.slice(0, -1) : word;
  switch (singular) {
    case "avatar":
      return "Avatar";
    case "aura":
      return "Aura";
    case "artifact":
      return "Artifact";
    case "minion":
      return "Minion";
    case "magic":
    case "spell":
      return "Magic";
    case "site":
      return "Site";
    case "sideboard":
    case "collection":
      return "Sideboard";
    default:
      return null;
  }
}

function isCategoryHeader(line: string): DeckTextCategory | null {
  // Examples: "Avatar (1)" or "Minions (31)" or just "Magic"
  const m = normalizeName(line);
  // Pull the leading word token
  const header = m.replace(/\s*\(\d+\)\s*$/, "");
  return canonicalizeCategory(header);
}

function isOnlyDigits(line: string): boolean {
  return /^\d+$/.test(line.trim());
}

function parseCountAndName(
  line: string
): { count: number; name: string; set?: string } | null {
  // Strategy:
  // 1. First try to match "count separator name" where separator is space or comma
  //    This handles cards starting with numbers like "1 13 Treasures of Britain"
  // 2. Fall back to "countName" (no separator) for lines like "1Druid"
  //    Only if the name part doesn't start with a digit

  // Try with explicit separator first (space or comma after count)
  // This correctly parses "1 13 Treasures of Britain" as count=1, name="13 Treasures of Britain"
  const withSep = line.match(/^(\d+)[,\s]+(.+)$/);
  if (withSep) {
    const count = parseInt(withSep[1], 10);
    if (!Number.isFinite(count) || count <= 0) return null;
    const rawName = normalizeName(withSep[2]);
    if (!rawName) return null;
    // Check for CardNexus format: "Card Name (SET-NAME)"
    const { name, set } = extractSetFromName(rawName);
    return { count, name, set };
  }

  // Fall back to no-separator format (e.g., "1Druid")
  // Only allow if the character after digits is NOT a digit
  const noSep = line.match(/^(\d+)([^\d].*)$/);
  if (noSep) {
    const count = parseInt(noSep[1], 10);
    if (!Number.isFinite(count) || count <= 0) return null;
    const rawName = normalizeName(noSep[2]);
    if (!rawName) return null;
    // Check for CardNexus format
    const { name, set } = extractSetFromName(rawName);
    return { count, name, set };
  }

  return null;
}

/**
 * Extract set name from CardNexus format: "Card Name (SET-NAME)"
 * Returns the card name without the set suffix and the normalized set name.
 */
function extractSetFromName(rawName: string): { name: string; set?: string } {
  // Match trailing parentheses with set name, e.g., "Valley (BETA)" or "Valley of Delight (ARTHURIAN-LEGENDS)"
  const setMatch = rawName.match(/^(.+?)\s*\(([A-Z][A-Z0-9-]*)\)\s*$/);
  if (setMatch) {
    const name = normalizeName(setMatch[1]);
    const rawSet = setMatch[2];
    // Normalize set name: ARTHURIAN-LEGENDS -> Arthurian Legends, BETA -> Beta, etc.
    const set = normalizeSetName(rawSet);
    return { name, set };
  }
  return { name: rawName };
}

/**
 * Normalize CardNexus set names to match our database set names.
 * E.g., "ARTHURIAN-LEGENDS" -> "Arthurian Legends", "BETA" -> "Beta"
 */
function normalizeSetName(raw: string): string {
  // Replace hyphens with spaces and title-case
  return raw
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function parseSorceryDeckText(rawInput: string): ParsedDeckText {
  const text = rawInput.replace(/[\r]+/g, "\n");
  const lines = text
    .split(/\n+/)
    .map((x) => x.replace(/\u00A0/g, " ").trim())
    .filter((x) => x.length > 0);

  // Track cards by name with their count and optional set
  // Key is "name" or "name|set" to allow same card from different sets
  type CardEntry = { count: number; set?: string };
  const categories: Record<DeckTextCategory, Map<string, CardEntry>> = {
    Avatar: new Map(),
    Aura: new Map(),
    Artifact: new Map(),
    Minion: new Map(),
    Magic: new Map(),
    Site: new Map(),
    Sideboard: new Map(),
  };

  const issues: { type: "error" | "warning"; message: string }[] = [];

  let current: DeckTextCategory | null = null;

  for (const rawLine of lines) {
    const line = normalizeName(rawLine);

    // Stop at deck history footer if present
    if (/^deck history$/i.test(line)) break;

    // Skip standalone digits (mana/threshold icons captured as numbers)
    if (isOnlyDigits(line)) continue;

    // Category header?
    const cat = isCategoryHeader(line);
    if (cat) {
      current = cat;
      continue;
    }

    // Card line
    const parsed = parseCountAndName(line);
    if (parsed) {
      if (!current) {
        // If no current category, treat as warning and default to Magic (spellbook)
        current = "Magic";
        issues.push({
          type: "warning",
          message: `No category header before line: "${line}". Defaulted to Magic.`,
        });
      }
      const map = categories[current];
      // Use name|set as key to distinguish same card from different sets
      const key = parsed.set
        ? `${normalizeName(parsed.name)}|${parsed.set}`
        : normalizeName(parsed.name);
      const existing = map.get(key);
      if (existing) {
        existing.count += parsed.count;
      } else {
        map.set(key, { count: parsed.count, set: parsed.set });
      }
      continue;
    }

    // Unknown line - ignore but record a warning
    issues.push({
      type: "warning",
      message: `Unrecognized line ignored: "${line}"`,
    });
  }

  const resultLists: Record<DeckTextCategory, NameCount[]> = {
    Avatar: [],
    Aura: [],
    Artifact: [],
    Minion: [],
    Magic: [],
    Site: [],
    Sideboard: [],
  };
  const totalByCategory: Record<DeckTextCategory, number> = {
    Avatar: 0,
    Aura: 0,
    Artifact: 0,
    Minion: 0,
    Magic: 0,
    Site: 0,
    Sideboard: 0,
  };

  for (const cat of CATEGORY_ORDER) {
    const items = Array.from(categories[cat].entries())
      .map(([key, entry]) => {
        // Extract name from key (remove |set suffix if present)
        const name = key.includes("|") ? key.split("|")[0] : key;
        return { name, count: entry.count, set: entry.set };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    resultLists[cat] = items;
    totalByCategory[cat] = items.reduce((a, b) => a + b.count, 0);
  }

  const totalCards = CATEGORY_ORDER.reduce(
    (sum, c) => sum + totalByCategory[c],
    0
  );

  // Basic sanity checks
  if (totalByCategory.Avatar !== 1) {
    issues.push({
      type: "warning",
      message: `Expected exactly 1 Avatar, found ${totalByCategory.Avatar}`,
    });
  }

  return { categories: resultLists, totalByCategory, totalCards, issues };
}

export type Zone = "Spellbook" | "Atlas" | "Collection";
export interface ZoneEntry extends NameCount {
  zone: Zone;
}

export function toZones(parsed: ParsedDeckText): ZoneEntry[] {
  const z: ZoneEntry[] = [];
  const pushCat = (cat: DeckTextCategory, zone: Zone) => {
    for (const it of parsed.categories[cat]) z.push({ ...it, zone });
  };
  pushCat("Avatar", "Spellbook");
  pushCat("Aura", "Spellbook");
  pushCat("Artifact", "Spellbook");
  pushCat("Minion", "Spellbook");
  pushCat("Magic", "Spellbook");
  pushCat("Site", "Atlas");
  pushCat("Sideboard", "Collection"); // Collection zone (up to 10 cards)
  return z;
}

export type CubeZone = "main" | "sideboard";
export interface CubeEntry extends NameCount {
  cubeZone: CubeZone;
}

export function toCubeEntries(parsed: ParsedDeckText): CubeEntry[] {
  const entries: CubeEntry[] = [];
  const pushCat = (cat: DeckTextCategory, cubeZone: CubeZone) => {
    for (const it of parsed.categories[cat]) entries.push({ ...it, cubeZone });
  };
  // All primary categories are part of the main cube pool
  pushCat("Avatar", "main");
  pushCat("Aura", "main");
  pushCat("Artifact", "main");
  pushCat("Minion", "main");
  pushCat("Magic", "main");
  pushCat("Site", "main");
  // Optional sideboard section, if present in the text
  pushCat("Sideboard", "sideboard");
  return entries;
}
