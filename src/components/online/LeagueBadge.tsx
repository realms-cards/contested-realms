"use client";

interface LeagueBadgeProps {
  slug: string;
  name: string;
  badgeColor?: string | null;
  compact?: boolean;
}

const LEAGUE_EMOJIS: Record<string, string> = {
  "sorcerers-summit": "\u26F0\uFE0F",
};

const LEAGUE_SHORT_NAMES: Record<string, string> = {
  "sorcerers-summit": "Summit",
};

export function LeagueBadge({
  slug,
  name,
  badgeColor,
  compact = false,
}: LeagueBadgeProps) {
  const emoji = LEAGUE_EMOJIS[slug] || "\uD83C\uDFC6";
  const shortName = LEAGUE_SHORT_NAMES[slug] || name;
  const color = badgeColor || "#7c3aed";

  if (compact) {
    return (
      <span
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded border"
        style={{
          backgroundColor: `${color}20`,
          color,
          borderColor: `${color}40`,
        }}
        title={name}
      >
        <span className="text-[10px] leading-none">{emoji}</span>
        {shortName}
      </span>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-lg border"
      style={{
        background: `linear-gradient(to right, ${color}20, ${color}10)`,
        color,
        borderColor: `${color}40`,
      }}
    >
      <span className="text-sm leading-none">{emoji}</span>
      <span>{name}</span>
    </div>
  );
}

interface LeagueBadgeListProps {
  leagues: Array<{
    slug: string;
    name: string;
    badgeColor?: string | null;
  }>;
  compact?: boolean;
}

/**
 * Renders a row of league badges for a player.
 */
export function LeagueBadgeList({
  leagues,
  compact = true,
}: LeagueBadgeListProps) {
  if (leagues.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-1">
      {leagues.map((league) => (
        <LeagueBadge
          key={league.slug}
          slug={league.slug}
          name={league.name}
          badgeColor={league.badgeColor}
          compact={compact}
        />
      ))}
    </span>
  );
}
