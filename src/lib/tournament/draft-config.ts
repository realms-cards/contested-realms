import type { Prisma } from '@prisma/client';

type PackConfigurationEntry = { setId: string; packCount: number };

type DraftSetup = {
  packConfiguration: PackConfigurationEntry[];
  timePerPick: number;
  deckBuildingTime: number;
};

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(n) && n > 0 ? Number(n) : fallback;
}

export function deriveDraftSetupFromSettings(settings: unknown): DraftSetup {
  const json = (settings as Prisma.JsonValue) ?? {};
  const obj = (json && typeof json === 'object') ? (json as Record<string, unknown>) : {};
  const draftConfig = ((obj.draftConfig ?? obj.draft) as Record<string, unknown> | undefined) ?? {};

  let packConfiguration = Array.isArray(draftConfig.packConfiguration)
    ? (draftConfig.packConfiguration as PackConfigurationEntry[])
    : [];

  if (packConfiguration.length === 0) {
    const packCounts = draftConfig.packCounts as Record<string, unknown> | undefined;
    if (packCounts) {
      const entries = Object.entries(packCounts)
        .map(([setId, count]) => ({ setId, packCount: Number(count) || 0 }))
        .filter((entry) => entry.packCount > 0);
      packConfiguration = entries;
    }
  }

  if (packConfiguration.length === 0) {
    packConfiguration = [{ setId: 'Beta', packCount: 3 }];
  }

  const timePerPick = toNumber(draftConfig.draftTimeLimit, 90);
  const deckBuildingTime = toNumber(draftConfig.deckBuildingTimeLimit, 30);

  return {
    packConfiguration: packConfiguration.map((entry) => ({
      setId: entry.setId || 'Beta',
      packCount: Math.max(0, Number(entry.packCount) || 0),
    })),
    timePerPick,
    deckBuildingTime,
  };
}
