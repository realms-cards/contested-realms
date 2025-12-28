"use client";

import { Trophy } from "lucide-react";

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
        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium
                   bg-amber-600/20 text-amber-300 rounded border border-amber-500/30"
        title={tournamentName || "SATC League Participant"}
      >
        <Trophy className="w-3 h-3" />
        SATC
      </span>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium
                 bg-gradient-to-r from-amber-600/20 to-amber-500/10 
                 text-amber-200 rounded-lg border border-amber-500/30"
    >
      <Trophy className="w-3.5 h-3.5 text-amber-400" />
      <span>SATC League</span>
      {tournamentName && (
        <span className="text-amber-400/70 text-[10px]">
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
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors
                  ${
                    checked
                      ? "bg-amber-600/20 border-amber-500/50"
                      : "bg-slate-800/50 border-slate-700 hover:border-slate-600"
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
        className="rounded border-amber-500 text-amber-500 focus:ring-amber-500 
                   disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <Trophy
        className={`w-4 h-4 ${checked ? "text-amber-400" : "text-slate-400"}`}
      />
      <div className="flex flex-col">
        <span
          className={`text-sm font-medium ${
            checked ? "text-amber-200" : "text-slate-300"
          }`}
        >
          Count as SATC League Match
        </span>
        {tournamentName && (
          <span className="text-xs text-slate-400">{tournamentName}</span>
        )}
      </div>
    </label>
  );
}
