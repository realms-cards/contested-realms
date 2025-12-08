// Constants for available sets - can be imported anywhere without React context issues

// Default sets to use before API loads or on error
// Gothic is first as it's the newest set
// Note: Dragonlord is a mini-set and not available for draft
export const DEFAULT_DRAFTABLE_SETS = [
  "Gothic",
  "Arthurian Legends",
  "Beta",
  "Alpha",
];

// Fallback default set for pack configs (newest set)
export const DEFAULT_SET = "Gothic";

/**
 * Build default pack counts object from set names.
 * First set gets the default count, others get 0.
 */
export function buildDefaultPackCounts(
  setNames: string[],
  defaultSet: string = DEFAULT_SET,
  defaultCount: number = 6
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of setNames) {
    counts[name] = name === defaultSet ? defaultCount : 0;
  }
  // Ensure default set is included even if not in setNames
  if (!(defaultSet in counts) && setNames.length > 0) {
    counts[setNames[0]] = defaultCount;
  }
  return counts;
}
