import { Html } from "@react-three/drei";
import { useCallback, useState } from "react";
import TokenAttachmentDialog from "@/lib/game/components/TokenAttachmentDialog";
import type { AvatarState, CardRef, GameState, PlayerKey } from "@/lib/game/store/types";
import { useGameStore } from "@/lib/game/store";

type AttachmentTarget = {
  at: string;
  index: number;
  card: CardRef;
};

export type AttachmentPileInfo = {
  who: PlayerKey;
  from: "tokens" | "spellbook" | "atlas" | "graveyard";
  card: CardRef;
};

type AttachmentDialogState = {
  token: CardRef;
  targetPermanent: AttachmentTarget;
  dropCoords: { x: number; y: number };
  fromPile: boolean;
  pileInfo?: AttachmentPileInfo | null;
};

type UseAttachmentDialogOptions = {
  setDragFromPile: GameState["setDragFromPile"];
  playFromPileTo: (x: number, y: number) => void;
  attachTokenToPermanent: GameState["attachTokenToPermanent"];
  attachPermanentToAvatar: GameState["attachPermanentToAvatar"];
};

export function useAttachmentDialog({
  setDragFromPile,
  playFromPileTo,
  attachTokenToPermanent,
  attachPermanentToAvatar,
}: UseAttachmentDialogOptions) {
  const [dialog, setDialog] = useState<AttachmentDialogState | null>(null);

  const openAttachmentDialog = useCallback(
    (payload: AttachmentDialogState) => {
      setDialog(payload);
    },
    []
  );

  const handleConfirm = useCallback(() => {
    if (!dialog) return;
    const { token, targetPermanent, dropCoords, fromPile, pileInfo } = dialog;
    const isAvatarTarget = targetPermanent.index === -1;

    if (fromPile && pileInfo) {
      setDragFromPile(pileInfo);
      playFromPileTo(dropCoords.x, dropCoords.y);
      setTimeout(() => {
        const state = useGameStore.getState();
        const perms = state.permanents[targetPermanent.at] || [];
        const cardIndex = perms.findIndex(
          (p) => !p.attachedTo && p.card.name === pileInfo.card.name
        );
        if (cardIndex >= 0) {
          if (isAvatarTarget) {
            const avatarSeat = findAvatarSeatAt(targetPermanent.at, state.avatars);
            if (avatarSeat) {
              attachPermanentToAvatar(targetPermanent.at, cardIndex, avatarSeat);
            }
          } else {
            attachTokenToPermanent(targetPermanent.at, cardIndex, targetPermanent.index);
          }
        }
        setDragFromPile(null);
      }, 100);
    } else {
      const state = useGameStore.getState();
      const perms = state.permanents[targetPermanent.at] || [];
      const cardIndex = perms.findIndex(
        (p) => !p.attachedTo && p.card.name === token.name
      );
      if (cardIndex >= 0) {
        if (isAvatarTarget) {
          const avatarSeat = findAvatarSeatAt(targetPermanent.at, state.avatars);
          if (avatarSeat) {
            attachPermanentToAvatar(targetPermanent.at, cardIndex, avatarSeat);
          }
        } else {
          attachTokenToPermanent(targetPermanent.at, cardIndex, targetPermanent.index);
        }
      }
    }

    setDialog(null);
  }, [
    dialog,
    attachPermanentToAvatar,
    attachTokenToPermanent,
    playFromPileTo,
    setDragFromPile,
  ]);

  const handleCancel = useCallback(() => {
    if (!dialog) return;
    if (dialog.fromPile && dialog.pileInfo) {
      setDragFromPile(dialog.pileInfo);
      playFromPileTo(dialog.dropCoords.x, dialog.dropCoords.y);
      setTimeout(() => setDragFromPile(null), 50);
    }
    setDialog(null);
  }, [dialog, playFromPileTo, setDragFromPile]);

  const attachmentDialogNode = dialog ? (
    <Html fullscreen zIndexRange={[10, 0]}>
      <TokenAttachmentDialog
        token={dialog.token}
        targetPermanent={dialog.targetPermanent}
        dropCoords={dialog.dropCoords}
        fromPile={dialog.fromPile}
        pileInfo={dialog.pileInfo}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </Html>
  ) : null;

  return { openAttachmentDialog, attachmentDialogNode };
}

function findAvatarSeatAt(
  key: string,
  avatars: GameState["avatars"]
): PlayerKey | undefined {
  const [x, y] = key.split(",").map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return (Object.entries(avatars || {}) as Array<[PlayerKey, AvatarState]>).find(
    ([, avatar]) => {
      const pos = avatar.pos;
      return pos && pos[0] === x && pos[1] === y;
    }
  )?.[0];
}
