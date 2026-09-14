"use client";

interface SoatcLeagueBadgeProps {
  tournamentName?: string;
  compact?: boolean;
}

export function SoatcLeagueBadge({
  tournamentName,
  compact = false,
}: SoatcLeagueBadgeProps) {
  if (compact) {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 font-rc-mono text-[10px] font-medium tracking-[0.12em]
                   bg-rc-accent/16 text-rc-accent-link rounded-rc-sm border border-rc-accent/35"
        title={tournamentName || "SATC League Participant"}
      >
        SATC
      </span>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 font-rc-mono text-xs font-medium
                 bg-rc-accent/12
                 text-rc-accent-link rounded-rc-md border border-rc-accent/35"
    >
      <span>SATC League</span>
      {tournamentName && (
        <span className="text-rc-fg-subtle text-[10px]">
          • {tournamentName}
        </span>
      )}
    </div>
  );
}

interface SoatcLeagueCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  tournamentName?: string;
}

export function SoatcLeagueCheckbox({
  checked,
  onChange,
  disabled = false,
  tournamentName,
}: SoatcLeagueCheckboxProps) {
  return (
    <label
      className={`flex items-center gap-2 px-3 py-2 rounded-rc-md border transition-colors
                  ${
                    checked
                      ? "bg-rc-accent/8 border-rc-accent/35"
                      : "bg-black/30 border-rc-line/12 hover:border-rc-accent/40"
                  }
                  ${
                    disabled
                      ? "opacity-50 cursor-not-allowed"
                      : "cursor-pointer"
                  }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="accent-rc-accent
                   disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <div className="flex flex-col">
        <span
          className={`font-rc-sans text-sm font-medium ${
            checked ? "text-rc-fg-strong" : "text-rc-fg-muted"
          }`}
        >
          Count as SATC League Match
        </span>
        {tournamentName && (
          <span className="font-rc-sans text-xs text-rc-fg-subtle">{tournamentName}</span>
        )}
      </div>
    </label>
  );
}
