"use client";

import React from "react";
import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";

export default function AutoResolveConfirmOverlay() {
  const pending = useGameStore((s) => s.pendingAutoResolve);
  const actorKey = useGameStore((s) => s.actorKey);
  const confirm = useGameStore((s) => s.confirmAutoResolve);
  const cancel = useGameStore((s) => s.cancelAutoResolve);

  if (!pending) return null;

  const { ownerSeat, sourceName, effectDescription } = pending;

  // Only show overlay to the owner
  if (actorKey !== null && ownerSeat !== actorKey) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
      <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-md w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel">
        <h2 className="mb-4 text-center font-rc-display text-[26px] leading-tight text-rc-fg-strong">
          {sourceName}
        </h2>
        <p className="text-rc-fg-muted text-center mb-4">{effectDescription}</p>

        <p className="text-rc-fg-muted text-center mb-6 text-sm">
          Auto-resolve will execute this ability automatically.
          <br />
          <span className="text-rc-warning">
            Decline if the card is silenced or you want manual control.
          </span>
        </p>

        {/* Action buttons */}
        <div className="flex gap-4 justify-center">
          <RcButton variant="outline" onClick={cancel}>
            Decline (Manual)
          </RcButton>
          <RcButton onClick={confirm}>
            Auto-Resolve
          </RcButton>
        </div>

        <p className="text-rc-fg-subtle text-xs text-center mt-4">
          Declining will skip the automatic effect.
        </p>
      </div>
    </div>
  );
}
