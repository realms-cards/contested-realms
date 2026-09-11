// Card ability detection utility
// Provides access to card rulesText for ability detection via API

// Static keyword maps for instant lookup (extracted from cards_raw.json)
// These are pre-computed for performance - no API call needed
const STEALTH_CARDS = new Set([
  "Aino",
  "Asmodeus",
  "Band of Thieves",
  "Brocéliande",
  "City of Traitors",
  "Dark Alley",
  "Dead of Night Demon",
  "Draco Corvus",
  "Fade",
  "Far East Assassin",
  "Feign Death",
  "Frozen Horror",
  "Gossamer Ghost",
  "Hounds of Ondaros",
  "Hunter's Lodge",
  "Hunting Party",
  "Infiltrate",
  "Jack the Ripper",
  "Kingswood Poachers",
  "Master Tracker",
  "Midnight Rogue",
  "Morgana le Fay",
  "Moss Troll",
  "Phase Assassin",
  "Questing Beast",
  "Scent Hounds",
  "Sir Agravaine",
  "Sir Bors the Younger",
  "Sly Fox",
  "Sneak Thief",
  "Survivors of Serava",
  "Swindler Troupe",
  "Treetop Hideout",
  "Truesight Crossbow",
  "Vanishment",
  "Watchtower",
  "Winter Nymph",
]);

const WARD_CARDS = new Set([
  "Accursed Desert",
  "Accursed Tower",
  "Angel Ascendant",
  "Archangel Gabriel",
  "Archangel Michael",
  "Archangel Raphael",
  "Archangel Samael",
  "Bane of Aventis",
  "Baptize",
  "Bless",
  "Blessed Village",
  "Blessed Well",
  "Book of Blessings",
  "Call of the Sea",
  "Cherubim",
  "Clairvoyant",
  "Consecrate",
  "Coy Nixie",
  "Crave Golem",
  "Dalcean Phalanx",
  "Demonic Contract",
  "Divine Lance",
  "Doctor Demetrius",
  "Enduring Faith",
  "Faith Incarnate",
  "Ghostfire",
  "Guardian Angel",
  "Guile Sirens",
  "Heretics of Seth",
  "Hillside Chapel",
  "Holy Nova",
  "Holy Warrior",
  "Holy Water",
  "Hotwheel",
  "Kissers of Wounds",
  "Malakhim",
  "Martyrs of Tomorrow",
  "Monks of Kobalsa",
  "Mount Ussar Sanctuary",
  "Murder of Crows",
  "Nightwatchmen",
  "Ophanim",
  "Order of the Pale Worm",
  "Order of the Sacred Oak",
  "Order of the White Wing",
  "Paladins of Bazia",
  "Persecutor",
  "Pilgrim's Shrine",
  "Red Rock of Ravannis",
  "Revered Revenant",
  "Sacred Stag",
  "Saint of Redemption",
  "Savior",
  "Second Wind",
  "Seraphim",
  "Sir Agravaine",
  "Sister Stefánia",
  "Skeleton Mage",
  "The Empyrean",
  "Unland Angler",
  "Vanguard Knights",
  "Virgin in Prayer",
  "Wreathed in Righteousness",
  "Zeppelin of Zealots",
]);

const LANCE_CARDS = new Set([
  "Blue Knight",
  "Dame Britomart",
  "Forge",
  "Lance",
  "Purple Knight",
  "Reckless Squire",
  "Shameless Squire",
  "Sir Balin",
  "Sir Gaheris",
  "Sir Lancelot",
  "Sir Pellinore",
  "Sir Priamus",
  "Sir Yvain",
  "Spearmarshal",
  "Thankless Squire",
  "Verdant Knight",
  "Weightless Squire",
  "Yellow Knight",
]);

// Cache for ability data to avoid repeated API calls
const abilityCache = new Map<
  string,
  { canBurrow: boolean; canSubmerge: boolean; rulesText: string | null }
>();

/**
 * Fetch card abilities from the API
 * @param cardName The card name to check
 * @returns Promise resolving to ability data
 */
async function fetchCardAbilities(cardName: string): Promise<{
  canBurrow: boolean;
  canSubmerge: boolean;
  rulesText: string | null;
}> {
  try {
    const response = await fetch(
      `/api/cards/rules?name=${encodeURIComponent(cardName)}`
    );
    if (!response.ok) {
      return { canBurrow: false, canSubmerge: false, rulesText: null };
    }
    const data = await response.json();
    return {
      canBurrow: data.canBurrow || false,
      canSubmerge: data.canSubmerge || false,
      rulesText: data.rulesText || null,
    };
  } catch (error) {
    console.warn("Failed to fetch card abilities for", cardName, error);
    return { canBurrow: false, canSubmerge: false, rulesText: null };
  }
}

/**
 * Detect burrow and submerge abilities for a card (async)
 * @param cardName The card name to check
 * @returns Promise resolving to object with canBurrow and canSubmerge boolean flags
 */
export async function detectBurrowSubmergeAbilities(cardName: string): Promise<{
  canBurrow: boolean;
  canSubmerge: boolean;
}> {
  // Check cache first
  const cached = abilityCache.get(cardName.toLowerCase());
  if (cached) {
    return { canBurrow: cached.canBurrow, canSubmerge: cached.canSubmerge };
  }

  // Fetch from API
  const abilities = await fetchCardAbilities(cardName);

  // Cache the result
  abilityCache.set(cardName.toLowerCase(), abilities);

  return { canBurrow: abilities.canBurrow, canSubmerge: abilities.canSubmerge };
}

/**
 * Detect burrow and submerge abilities for a card (synchronous fallback with name-based heuristics)
 * This is used as a fallback when async detection is not possible
 * @param cardName The card name to check
 * @returns Object with canBurrow and canSubmerge boolean flags
 */
export function detectBurrowSubmergeAbilitiesSync(cardName: string): {
  canBurrow: boolean;
  canSubmerge: boolean;
} {
  // Check cache first
  const cached = abilityCache.get(cardName.toLowerCase());
  if (cached) {
    return { canBurrow: cached.canBurrow, canSubmerge: cached.canSubmerge };
  }

  // Fallback to name-based heuristics for common cards
  const lowerName = cardName.toLowerCase();

  // Known burrowing cards based on card data analysis
  const burrowingNames = [
    "hounds of ondaros",
    "palliburrie bats",
    "cave trolls",
    "dwarven digging team",
    "gneissgnath gnomes",
    "root spider",
    "pit vipers",
    "sand worm",
    "muck lampreys",
    "bluecap knockers",
    "dirium fomorians",
    "muirid fomorians",
  ];

  // Known submerge cards based on card data analysis
  const submergeNames = [
    "hounds of ondaros",
    "muck lampreys",
    "anui undine",
    "dirium fomorians",
    "muirid fomorians",
    "vatn draconis",
  ];

  const canBurrow =
    burrowingNames.some((name) => lowerName.includes(name)) ||
    lowerName.includes("burrow") ||
    lowerName.includes("worm");
  const canSubmerge =
    submergeNames.some((name) => lowerName.includes(name)) ||
    lowerName.includes("submerge") ||
    lowerName.includes("undine");

  return { canBurrow, canSubmerge };
}

export async function detectRangedAbility(cardName: string): Promise<boolean> {
  try {
    const abilities = await fetchCardAbilities(cardName);
    const txt = (abilities.rulesText || "").toLowerCase();
    if (!txt) return false;
    if (txt.includes("ranged")) return true;
    if (txt.includes("bow")) return true;
    if (txt.includes("archer")) return true;
    if (txt.includes("sling")) return true;
    if (txt.includes("shoot")) return true;
    return false;
  } catch {
    return false;
  }
}

export function detectRangedAbilitySync(cardName: string): boolean {
  const cached = abilityCache.get(cardName.toLowerCase());
  if (cached && cached.rulesText) {
    const t = cached.rulesText.toLowerCase();
    if (
      t.includes("ranged") ||
      t.includes("bow") ||
      t.includes("archer") ||
      t.includes("sling") ||
      t.includes("shoot")
    )
      return true;
  }
  const n = cardName.toLowerCase();
  if (n.includes("archer")) return true;
  if (n.includes("bow")) return true;
  if (n.includes("sling")) return true;
  if (n.includes("ranger")) return true;
  return false;
}

// --- Magic spellcasting + targeting hints (heuristic, v1) --------------------

/** What the caster has to pick on the board for a Magic spell. */
export type MagicTargetMode =
  | "projectile" // a straight line from the caster; first unit hit is the target
  | "site" // a location / site
  | "single" // one unit or avatar
  | "area" // no pick: the effect covers every unit in range of the caster
  | "none"; // no board target at all (draw, gain life, ...)

/** How far from the caster the pick / effect reaches. */
export type MagicTargetRange =
  | "here"
  | "adjacent"
  | "nearby"
  | "two-steps"
  | "global";

export type MagicTargetHints = {
  /** Legacy scope; kept for older consumers. Derived from `mode`/`range`. */
  scope: "here" | "adjacent" | "nearby" | "global" | "projectile" | null;
  mode: MagicTargetMode;
  range: MagicTargetRange;
  allow: { location?: boolean; permanent?: boolean; avatar?: boolean };
  /** False when no rules text was available, so the hints are only a guess. */
  fromText: boolean;
};

/**
 * Cards that carry the Spellcaster keyword themselves, and so can cast a
 * magic on their own. Not only minions: four Omphalos artifacts and the
 * Wicker Manikin cast, and two sites do (Merlin's Tower only after its
 * Genesis ability, which the guide cannot see, so it is listed as eligible).
 *
 * Derived from `data/cards_raw.json` (rules text carrying "Spellcaster" as its
 * own keyword line, e.g. "Spellcaster", "Fire Spellcaster", "Non-fire
 * Spellcaster"). Cards that merely mention Spellcasters are excluded.
 */
const SPELLCASTER_CARDS = new Set([
  // Minions
  "Adept Illusionist",
  "Apprentice Wizard",
  "Arjaro Exorcist",
  "Cauldron Crones",
  "Earl of the Ivory Towers",
  "Fenvale Muse",
  "Grandmaster Wizard",
  "Grigori Rasputin",
  "Lava Salamander",
  "Master Necromancer",
  "Merlin",
  "Mordric Druids",
  "Mover of Mountains",
  "Novice Necromancer",
  "Sisters of Avalon",
  "Skeleton Mage",
  "Wicked Witch",
  // Artifacts that cast by themselves
  "Algor Omphalos",
  "Char Omphalos",
  "Dank Omphalos",
  "Torrid Omphalos",
  "Wicker Manikin",
  // Sites that cast by themselves
  "River of Flame",
  "Merlin's Tower",
]);

/**
 * Artifacts whose *bearer* gains Spellcaster while carrying them, so an
 * ordinary minion holding one may cast. Cards that only act on an
 * already-Spellcaster bearer (Book of the Dead, De Vermis Mysteriis,
 * The Malleus Maleficarum) are deliberately absent.
 */
const SPELLCASTER_GRANTING_ARTIFACTS = new Set([
  "Eerie Coral",
  "Hand of Glory",
  "Mandrake Jars",
  "Merlin's Staff",
  "Sensu of the Fang",
  "Wiccan Tools",
]);

/** Sites that make the minions standing on them Spellcasters. */
const SPELLCASTER_GRANTING_SITES = new Set(["Standing Stones"]);

/** Card names vary in apostrophe style between sources; compare on one form. */
function normalizeCardName(cardName: string | null | undefined): string {
  return (cardName || "").replace(/[‘’]/g, "'").trim();
}

/** True when the card itself carries the Spellcaster keyword. */
export function isSpellcasterCard(
  cardName: string | null | undefined,
  rulesText?: string | null
): boolean {
  const name = normalizeCardName(cardName);
  if (!name) return false;
  if (SPELLCASTER_CARDS.has(name)) return true;
  // Fall back to the rules text for cards outside the known sets (new sets,
  // tokens). Only a standalone keyword line counts: "an allied Spellcaster"
  // and similar references must not make the card itself a caster.
  const txt = rulesText ?? abilityCache.get(name.toLowerCase())?.rulesText;
  if (!txt) return false;
  return txt
    .split(/[\r\n]+/)
    .some((line) =>
      /^(?:non-)?(?:[a-z]+(?:\s+and\s+[a-z]+)?\s+)?spellcasters?$/i.test(
        line.trim()
      )
    );
}

/** True when carrying this artifact makes its bearer a Spellcaster. */
export function isSpellcasterGrantingArtifact(
  cardName: string | null | undefined
): boolean {
  return SPELLCASTER_GRANTING_ARTIFACTS.has(normalizeCardName(cardName));
}

/** True when minions standing on this site count as Spellcasters. */
export function isSpellcasterGrantingSite(
  cardName: string | null | undefined
): boolean {
  return SPELLCASTER_GRANTING_SITES.has(normalizeCardName(cardName));
}

export async function detectSpellcaster(cardName: string): Promise<boolean> {
  try {
    const abilities = await fetchCardAbilities(cardName);
    return isSpellcasterCard(cardName, abilities.rulesText);
  } catch {
    return isSpellcasterCard(cardName);
  }
}

export function detectSpellcasterSync(
  cardName: string,
  rulesText?: string | null
): boolean {
  return isSpellcasterCard(cardName, rulesText);
}

export async function extractMagicTargetingHints(
  cardName: string
): Promise<MagicTargetHints> {
  try {
    const abilities = await fetchCardAbilities(cardName);
    return extractMagicTargetingHintsSync(cardName, abilities.rulesText || "");
  } catch {
    return extractMagicTargetingHintsSync(cardName, null);
  }
}

const UNIT_WORDS =
  "(?:unit|minion|creature|permanent|artifact|aura|relic|totem|token|ally|avatar|beast|mortal|demon|undead|spirit|monster)";

/**
 * Classify a Magic spell's targeting from its rules text so the board can
 * show the caster's intention: a projectile line, a site, a single unit, an
 * area around the caster, or nothing at all.
 *
 * Heuristic by design: Sorcery rules text is written for humans. Precedence:
 * projectile > explicit "target <unit>" > "target site/location" >
 * indefinite "an ally/unit" > "each/all" area > none.
 */
export function extractMagicTargetingHintsSync(
  cardName: string,
  rulesText?: string | null
): MagicTargetHints {
  const txt = (
    rulesText ||
    abilityCache.get(cardName.toLowerCase())?.rulesText ||
    ""
  )
    .replace(/[’']/g, "'")
    .toLowerCase();
  const nameLc = (cardName || "").toLowerCase();

  const range: MagicTargetRange = /\bnearby\b/.test(txt)
    ? "nearby"
    : /\badjacent\b/.test(txt)
      ? "adjacent"
      : /\btwo steps\b/.test(txt)
        ? "two-steps"
        : /\bhere\b/.test(txt)
          ? "here"
          : "global";

  const projectile =
    /\bprojectile\b/.test(txt) ||
    (!txt && /\b(grapple|shot|missile|arrow|bolt)\b/.test(nameLc));
  const targetUnit = new RegExp(
    `\\btarget\\s+(?:\\w+\\s+){0,2}${UNIT_WORDS}s?\\b`
  ).test(txt);
  const targetSite =
    /\btarget\s+(?:\w+\s+){0,2}(?:site|location)s?\b/.test(txt) ||
    /\b(?:at|to|from)\s+a\s+(?:\w+\s+)?location\b/.test(txt) ||
    /\bchoose\s+(?:a|two|three)\s+(?:\w+\s+)?sites?\b/.test(txt);
  const indefiniteUnit = new RegExp(
    `\\b(?:an?|another)\\s+(?:\\w+\\s+){0,2}${UNIT_WORDS}\\b`
  ).test(txt);
  const area =
    /\b(?:each|all|every|everything|any number of)\b/.test(txt) ||
    /\bin the area of effect\b/.test(txt);

  let mode: MagicTargetMode = "none";
  if (projectile) mode = "projectile";
  else if (targetUnit) mode = "single";
  else if (targetSite) mode = "site";
  else if (indefiniteUnit) mode = "single";
  else if (area) mode = "area";
  else if (!txt) mode = "single"; // unknown text: let the caster pick freely

  const scope: MagicTargetHints["scope"] =
    mode === "projectile"
      ? "projectile"
      : range === "two-steps"
        ? "nearby"
        : range;

  const mentionsUnit = new RegExp(`\\b${UNIT_WORDS}s?\\b`).test(txt);
  const mentionsAvatar = /\b(avatar|player|opponent|unit)s?\b/.test(txt);
  const allow: MagicTargetHints["allow"] = {
    location:
      mode === "site" ||
      mode === "area" ||
      mode === "projectile" ||
      /\b(tile|site|location)s?\b/.test(txt),
    permanent: mode === "single" || mode === "projectile" || mentionsUnit || !txt,
    avatar:
      mode === "single" || mode === "projectile" || mentionsAvatar || !txt,
  };

  return { scope, mode, range, allow, fromText: txt.length > 0 };
}

// --- Stealth keyword detection ---

/**
 * Detect if a card has the Stealth keyword (instant lookup from static map)
 * @param cardName The card name to check
 * @returns Promise resolving to true if card has stealth keyword
 */
export async function detectStealthAbility(cardName: string): Promise<boolean> {
  // Instant lookup from static map - no API call needed
  return STEALTH_CARDS.has(cardName);
}

/**
 * Detect if a card has the Stealth keyword (instant lookup from static map)
 * @param cardName The card name to check
 * @param _rulesText Unused, kept for API compatibility
 * @returns true if card has stealth keyword
 */
export function detectStealthAbilitySync(
  cardName: string,
  _rulesText?: string | null
): boolean {
  return STEALTH_CARDS.has(cardName);
}

// --- Ward keyword detection ---

/**
 * Detect if a card has the Ward keyword (instant lookup from static map)
 * @param cardName The card name to check
 * @returns Promise resolving to true if card has ward keyword
 */
export async function detectWardAbility(cardName: string): Promise<boolean> {
  // Instant lookup from static map - no API call needed
  return WARD_CARDS.has(cardName);
}

/**
 * Detect if a card has the Ward keyword (instant lookup from static map)
 * @param cardName The card name to check
 * @param _rulesText Unused, kept for API compatibility
 * @returns true if card has ward keyword
 */
export function detectWardAbilitySync(
  cardName: string,
  _rulesText?: string | null
): boolean {
  return WARD_CARDS.has(cardName);
}

// --- Lance keyword detection ---

/**
 * Detect if a card has the Lance keyword (instant lookup from static map)
 * @param cardName The card name to check
 * @returns Promise resolving to true if card has lance keyword
 */
export async function detectLanceAbility(cardName: string): Promise<boolean> {
  // Instant lookup from static map - no API call needed
  return LANCE_CARDS.has(cardName);
}

/**
 * Detect if a card has the Lance keyword (instant lookup from static map)
 * @param cardName The card name to check
 * @param _rulesText Unused, kept for API compatibility
 * @returns true if card has lance keyword
 */
export function detectLanceAbilitySync(
  cardName: string,
  _rulesText?: string | null
): boolean {
  return LANCE_CARDS.has(cardName);
}

// --- Carry keyword detection ---

// Static set of cards with the Carry keyword
const CARRY_CARDS = new Set([
  "Hyperparasite",
]);

/**
 * Detect if a card has the Carry keyword (instant lookup from static map)
 * @param cardName The card name to check
 * @returns Promise resolving to true if card has carry keyword
 */
export async function detectCarryAbility(cardName: string): Promise<boolean> {
  return CARRY_CARDS.has(cardName);
}

/**
 * Detect if a card has the Carry keyword (instant lookup from static map)
 * @param cardName The card name to check
 * @returns true if card has carry keyword
 */
export function detectCarryAbilitySync(
  cardName: string,
  _rulesText?: string | null
): boolean {
  return CARRY_CARDS.has(cardName);
}
