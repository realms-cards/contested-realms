import type { Prisma } from "@prisma/client";

// Default set for fallback when no configuration is provided
// This should match the most commonly used draftable set
const DEFAULT_FALLBACK_SET = "Beta";

type PackConfigurationEntry = { setId: string; packCount: number };

type DraftSetup = {
  packConfiguration: PackConfigurationEntry[];
  cubeId?: string; // Optional cube ID for cube drafts
  timePerPick: number;
  deckBuildingTime: number;
  includeCubeSideboardInStandard?: boolean;
  podSize?: number; // Pod size for tournaments with more than 8 players (max 8)
};

// Default and maximum pod size for draft tournaments
export const DEFAULT_POD_SIZE = 8;
export const MAX_POD_SIZE = 8;
export const MIN_POD_SIZE = 4;

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(n) && n > 0 ? Number(n) : fallback;
}

export function deriveDraftSetupFromSettings(settings: unknown): DraftSetup {
  const json = (settings as Prisma.JsonValue) ?? {};
  const obj =
    json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const draftConfig =
    ((obj.draftConfig ?? obj.draft) as Record<string, unknown> | undefined) ??
    {};

  let packConfiguration = Array.isArray(draftConfig.packConfiguration)
    ? (draftConfig.packConfiguration as PackConfigurationEntry[])
    : [];

  if (packConfiguration.length === 0) {
    const packCounts = draftConfig.packCounts as
      | Record<string, unknown>
      | undefined;
    if (packCounts) {
      const entries = Object.entries(packCounts)
        .map(([setId, count]) => ({ setId, packCount: Number(count) || 0 }))
        .filter((entry) => entry.packCount > 0);
      packConfiguration = entries;
    }
  }

  if (packConfiguration.length === 0) {
    packConfiguration = [{ setId: DEFAULT_FALLBACK_SET, packCount: 3 }];
  }

  const timePerPick = toNumber(draftConfig.draftTimeLimit, 90);
  const deckBuildingTime = toNumber(draftConfig.deckBuildingTimeLimit, 30);
  const cubeId =
    typeof draftConfig.cubeId === "string" ? draftConfig.cubeId : undefined;
  const includeCubeSideboardInStandard =
    draftConfig.includeCubeSideboardInStandard === true;

  // Pod size for large tournaments (default 8, max 8, min 4)
  const rawPodSize = draftConfig.podSize;
  const podSize =
    typeof rawPodSize === "number" &&
    rawPodSize >= MIN_POD_SIZE &&
    rawPodSize <= MAX_POD_SIZE
      ? rawPodSize
      : DEFAULT_POD_SIZE;

  return {
    packConfiguration: packConfiguration.map((entry) => ({
      setId: entry.setId || DEFAULT_FALLBACK_SET,
      packCount: Math.max(0, Number(entry.packCount) || 0),
    })),
    cubeId,
    timePerPick,
    deckBuildingTime,
    includeCubeSideboardInStandard,
    podSize,
  };
}

/**
 * Calculate the number of pods needed for a tournament
 * @param playerCount Total number of players
 * @param podSize Size of each pod (max 8)
 * @returns Number of pods needed
 */
export function calculatePodCount(
  playerCount: number,
  podSize: number = DEFAULT_POD_SIZE,
): number {
  if (playerCount <= podSize) return 1;
  return Math.ceil(playerCount / podSize);
}

/**
 * Assign players to pods for draft
 * @param playerIds Array of player IDs
 * @param podSize Size of each pod
 * @returns Array of pods, each containing player IDs
 */
export function assignPlayersToPods(
  playerIds: string[],
  podSize: number = DEFAULT_POD_SIZE,
): string[][] {
  if (playerIds.length <= podSize) {
    return [playerIds];
  }

  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
  const pods: string[][] = [];
  const podCount = calculatePodCount(playerIds.length, podSize);

  // Distribute players evenly across pods
  const baseSize = Math.floor(shuffled.length / podCount);
  const extraPlayers = shuffled.length % podCount;

  let playerIndex = 0;
  for (let i = 0; i < podCount; i++) {
    // First 'extraPlayers' pods get one extra player
    const thisPodSize = baseSize + (i < extraPlayers ? 1 : 0);
    pods.push(shuffled.slice(playerIndex, playerIndex + thisPodSize));
    playerIndex += thisPodSize;
  }

  return pods;
}
