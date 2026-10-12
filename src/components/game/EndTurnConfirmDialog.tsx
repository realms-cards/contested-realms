"use client";

import { Modal } from "@/components/ui/Modal";
import { RcButton } from "@/components/ui/rc-button";
import { useColorBlind } from "@/lib/contexts/ColorBlindContext";
import { useGameStore } from "@/lib/game/store";

/**
 * Dialog shown when player tries to end turn with an untapped avatar.
 * Reminds them they can still draw a card or play a site.
 */
/**
 * `open`/`onConfirm`/`onCancel` let a mode that does not use the store's own turn machinery
 * (the Rules Engine mode, where the engine owns the turn) show the SAME warning with the same
 * wording, rather than growing a second dialog that says the same thing differently.
 */
export function EndTurnConfirmDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
} = {}) {
  const storeOpen = useGameStore((s) => s.showEndTurnConfirm);
  const storeConfirm = useGameStore((s) => s.confirmEndTurn);
  const storeDismiss = useGameStore((s) => s.dismissEndTurnConfirm);
  const showEndTurnConfirm = open ?? storeOpen;
  const confirmEndTurn = onConfirm ?? storeConfirm;
  const dismissEndTurnConfirm = onCancel ?? storeDismiss;
  const { enabled: colorBlindEnabled } = useColorBlind();

  if (!showEndTurnConfirm) return null;

  const primaryButtonClass = colorBlindEnabled
    ? "border-rc-info/60 bg-rc-info text-rc-bg hover:bg-rc-info hover:brightness-110"
    : "border-rc-success/60 bg-rc-success text-rc-bg hover:bg-rc-success hover:brightness-110";

  return (
    <Modal onClose={dismissEndTurnConfirm} closeOnBackdrop={false} backdropClassName="bg-[rgba(6,10,20,0.8)]">
      <div className="max-w-md rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 text-rc-fg shadow-rc-panel backdrop-blur-sm">
        <h3 className="mb-3 font-rc-display text-[22px] leading-none text-rc-fg-strong">
          End Turn?
        </h3>
        <p className="font-rc-sans text-rc-fg-muted text-sm mb-6">
          Your avatar is still untapped. You might want to{" "}
          <span className="text-rc-accent-link font-medium">draw a card</span> or{" "}
          <span className="text-rc-accent-link font-medium">play a site</span> first.
        </p>
        <div className="flex gap-3 justify-end">
          <RcButton
            variant="outline"
            onClick={dismissEndTurnConfirm}
          >
            Cancel
          </RcButton>
          <RcButton
            variant="secondary"
            onClick={confirmEndTurn}
            className={primaryButtonClass}
          >
            End Turn Anyway
          </RcButton>
        </div>
      </div>
    </Modal>
  );
}

export default EndTurnConfirmDialog;
