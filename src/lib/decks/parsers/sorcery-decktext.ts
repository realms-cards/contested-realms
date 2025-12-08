/*
 * Parser for Sorcery decklists copied from Curiosa-style text export.
 *
 * Supported format (examples):
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
 * Notes:
 * - Copy/paste sometimes introduces standalone numeric lines (cost/threshold icons). We ignore lines that are only digits.
 * - Some lines have no space between quantity and name (e.g., "1Druid"). We accept optional whitespace.
 * - We stop parsing if we encounter a footer like "Deck History".
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
): { count: number; name: string } | null {
  // Accept either "1Druid" or "1 Druid"; require count at start
  const m = line.match(/^(\d+)\s*(.+)$/);
  if (!m) return null;
  const count = parseInt(m[1], 10);
  if (!Number.isFinite(count) || count <= 0) return null;
  const name = normalizeName(m[2]);
  if (!name) return null;
  return { count, name };
}

export function parseSorceryDeckText(rawInput: string): ParsedDeckText {
  const text = rawInput.replace(/[\r]+/g, "\n");
  const lines = text
    .split(/\n+/)
    .map((x) => x.replace(/\u00A0/g, " ").trim())
    .filter((x) => x.length > 0);

  const categories: Record<DeckTextCategory, Map<string, number>> = {
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
      const key = normalizeName(parsed.name);
      map.set(key, (map.get(key) || 0) + parsed.count);
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
      .map(([name, count]) => ({ name, count }))
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
