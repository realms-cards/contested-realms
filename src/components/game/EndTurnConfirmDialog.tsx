"use client";

import { Modal } from "@/components/ui/Modal";
import { useColorBlind } from "@/lib/contexts/ColorBlindContext";
import { useGameStore } from "@/lib/game/store";

/**
 * Dialog shown when player tries to end turn with an untapped avatar.
 * Reminds them they can still draw a card or play a site.
 */
export function EndTurnConfirmDialog() {
  const showEndTurnConfirm = useGameStore((s) => s.showEndTurnConfirm);
  const confirmEndTurn = useGameStore((s) => s.confirmEndTurn);
  const dismissEndTurnConfirm = useGameStore((s) => s.dismissEndTurnConfirm);
  const { enabled: colorBlindEnabled } = useColorBlind();

  if (!showEndTurnConfirm) return null;

  const primaryButtonClass = colorBlindEnabled
    ? "bg-sky-600 hover:bg-sky-500"
    : "bg-emerald-600 hover:bg-emerald-500";

  return (
    <Modal onClose={dismissEndTurnConfirm} closeOnBackdrop={false}>
      <div className="bg-gray-900/95 backdrop-blur-sm rounded-lg shadow-xl border border-white/10 p-6 max-w-md">
        <h3 className="text-lg font-medium text-white mb-3">
          End Turn?
        </h3>
        <p className="text-gray-300 text-sm mb-6">
          Your avatar is still untapped. You might want to{" "}
          <span className="text-amber-400 font-medium">draw a card</span> or{" "}
          <span className="text-amber-400 font-medium">play a site</span> first.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={dismissEndTurnConfirm}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={confirmEndTurn}
            className={`px-4 py-2 rounded-lg ${primaryButtonClass} text-white text-sm font-medium transition-colors`}
          >
            End Turn Anyway
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default EndTurnConfirmDialog;
