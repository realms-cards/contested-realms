"use client";

import { Icon } from "@iconify/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { RcButton } from "@/components/ui/rc-button";
import {
  practiceIcon,
  practiceLabel,
  practiceModeForMatchType,
} from "@/lib/lobby/practice";
import type { MatchInfo } from "@/lib/net/protocol";

export type PracticeMatchControlsProps = {
  match: Pick<MatchInfo, "id" | "matchType" | "status">;
  /** Opens the practice game again. */
  onResume: () => void;
  /** Leaves the match and its lobby; the panel unmounts once both clear. */
  onEnd: () => void;
};

/**
 * Lobby-page controls for the player's own vs-CPU or goldfish practice game:
 * no auto-join countdown and no confirmation, just resume or end it.
 */
export default function PracticeMatchControls({
  match,
  onResume,
  onEnd,
}: PracticeMatchControlsProps) {
  const [ending, setEnding] = useState(false);
  const mode = practiceModeForMatchType(match.matchType);
  const label = practiceLabel(mode);
  const ended = match.status === "ended";

  const end = () => {
    if (ending) return;
    setEnding(true);
    try {
      onEnd();
    } catch {
      setEnding(false);
    }
  };

  return (
    <section
      aria-label={label}
      className="rc-panel flex flex-col gap-3 px-[18px] py-3.5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Icon
          icon={practiceIcon(mode)}
          aria-hidden
          className="h-7 w-7 shrink-0 text-rc-accent"
        />
        <div className="min-w-0">
          <h2 className="m-0 font-rc-display text-[22px] leading-none text-rc-fg-strong">
            {label}
          </h2>
          <div className="mt-1.5 font-rc-mono text-[11px] uppercase tracking-[0.14em] text-rc-fg-subtle">
            {match.status.replaceAll("_", " ")} · not listed for other players
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!ended && (
          <RcButton
            onClick={onResume}
            disabled={ending}
            title="Go back to your practice game"
          >
            Resume
          </RcButton>
        )}
        <RcButton
          variant="danger-soft"
          onClick={end}
          disabled={ending}
          aria-busy={ending}
          title="End the practice game and close its lobby"
        >
          {ending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Ending
            </>
          ) : (
            "End practice"
          )}
        </RcButton>
      </div>
    </section>
  );
}
