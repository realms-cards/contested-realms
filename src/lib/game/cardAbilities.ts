// Card ability detection utility
// Provides access to card rulesText for ability detection via API

// Cache for ability data to avoid repeated API calls
const abilityCache = new Map<string, { canBurrow: boolean; canSubmerge: boolean; rulesText: string | null }>();

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
    const response = await fetch(`/api/cards/rules?name=${encodeURIComponent(cardName)}`);
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
    'hounds of ondaros', 'palliburrie bats', 'cave trolls', 'dwarven digging team',
    'gneissgnath gnomes', 'root spider', 'pit vipers', 'sand worm', 'muck lampreys',
    'bluecap knockers', 'dirium fomorians', 'muirid fomorians'
  ];
  
  // Known submerge cards based on card data analysis  
  const submergeNames = [
    'hounds of ondaros', 'muck lampreys', 'anui undine', 'dirium fomorians', 
    'muirid fomorians', 'vatn draconis'
  ];
  
  const canBurrow = burrowingNames.some(name => lowerName.includes(name)) ||
                   lowerName.includes('burrow') || lowerName.includes('worm');
  const canSubmerge = submergeNames.some(name => lowerName.includes(name)) ||
                     lowerName.includes('submerge') || lowerName.includes('undine');

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
    if (t.includes("ranged") || t.includes("bow") || t.includes("archer") || t.includes("sling") || t.includes("shoot")) return true;
  }
  const n = cardName.toLowerCase();
  if (n.includes("archer")) return true;
  if (n.includes("bow")) return true;
  if (n.includes("sling")) return true;
  if (n.includes("ranger")) return true;
  return false;
}

// --- Magic spellcasting + targeting hints (heuristic, v1) --------------------

export type MagicTargetHints = {
  scope: "here" | "adjacent" | "nearby" | "global" | "projectile" | null;
  allow: { location?: boolean; permanent?: boolean; avatar?: boolean };
};

export async function detectSpellcaster(cardName: string): Promise<boolean> {
  try {
    const abilities = await fetchCardAbilities(cardName);
    const txt = (abilities.rulesText || "").toLowerCase();
    const name = cardName.toLowerCase();
    const nameCaster = /mage|wizard|sorcer|warlock|witch|shaman|conjur|enchant/.test(name);
    if (nameCaster) return true;
    if (!txt) return false;
    if (txt.includes("cast") || txt.includes("spellcaster")) return true;
    return false;
  } catch {
    return false;
  }
}

export function detectSpellcasterSync(cardName: string, rulesText?: string | null): boolean {
  const name = (cardName || "").toLowerCase();
  if (/mage|wizard|sorcer|warlock|witch|shaman|conjur|enchant/.test(name)) return true;
  const t = (rulesText || abilityCache.get(name)?.rulesText || "").toLowerCase();
  if (!t) return false;
  if (t.includes("cast") || t.includes("spellcaster")) return true;
  return false;
}

export async function extractMagicTargetingHints(cardName: string): Promise<MagicTargetHints> {
  try {
    const abilities = await fetchCardAbilities(cardName);
    return extractMagicTargetingHintsSync(cardName, abilities.rulesText || "");
  } catch {
    return extractMagicTargetingHintsSync(cardName, null);
  }
}

export function extractMagicTargetingHintsSync(cardName: string, rulesText?: string | null): MagicTargetHints {
  const txt = (rulesText || abilityCache.get(cardName.toLowerCase())?.rulesText || "").toLowerCase();
  const nameLc = (cardName || "").toLowerCase();
  const hints: MagicTargetHints = {
    scope: null,
    allow: { location: false, permanent: true, avatar: true },
  };
  const projectileByName = /\b(grapple|shot|missile|arrow|bolt)\b/.test(nameLc);
  if (txt.includes("projectile") || projectileByName) hints.scope = "projectile";
  else if (txt.includes("adjacent")) hints.scope = "adjacent";
  else if (txt.includes("nearby") || txt.includes("near")) hints.scope = "nearby";
  else if (txt.includes("here")) hints.scope = "here";
  else hints.scope = "global";
  if (/(tile|site|here|there|location)/.test(txt)) hints.allow.location = true;
  if (/(unit|minion|creature|permanent|artifact|relic|totem)/.test(txt)) hints.allow.permanent = true;
  if (/(avatar|player|opponent)/.test(txt)) hints.allow.avatar = true;
  return hints;
}